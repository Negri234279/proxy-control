import type { CustomLocation, EdgeRuleView, ReconcileState } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import { edgeRuleViews } from '../domain/edge-sync'
import { findRecord, listRecords, type CfDnsRecord } from '../providers/cloudflare'
import { listStaticDns, type MikrotikDnsEntry } from '../providers/mikrotik'
import { isProxyHostEnabled, listProxyHosts, type NpmProxyHost, type NpmProxyHostLocation } from '../providers/npm'
import { cloudflareDefaultContent, resolveCloudflare, resolveMikrotik } from '../settings/dns-providers'

// Compara el estado deseado (fila `Domain`) con el real (NPM + Cloudflare/Mikrotik) y
// deriva el estado de reconciliación. No modifica nada: solo lee.

export interface ProviderCheck {
    present: boolean
    drift: boolean
    // Resumen en una línea (ausencia/error o causas unidas). Compat con la vista actual.
    detail?: string
    // Causas del drift, una por entrada (para listarlas en el desplegable).
    reasons?: string[]
}

export interface DomainDiff {
    state: ReconcileState
    npm: ProviderCheck
    dns: ProviderCheck
    enabledInNpm: boolean
    issues: string[]
    // Reglas de borde de Cloudflare en vivo (solo público proxied; vacío en el resto).
    edge: EdgeRuleView[]
}

// NPM devuelve estos flags como boolean (v2.15) o como 0/1 según versión: toleramos ambos.
const intBool = (value: number | boolean): boolean => value === true || value === 1

// Clave nombre+tipo para casar registros de Cloudflare sin colisionar entre tipos
// distintos que comparten hostname (p. ej. un CNAME web y un MX de correo).
const cfKey = (name: string, type: string): string => `${name} ${type}`

const onOff = (value: boolean): string => (value ? 'activado' : 'desactivado')

// Devuelve el motivo del drift (esperado vs real) o null si el campo coincide.
function fieldDrift(label: string, expected: string | number, actual: string | number): string | null {
    if (expected === actual) return null

    return `${label}: esperado ${expected}, real ${actual}`
}

function flagDrift(label: string, expected: boolean, actual: boolean): string | null {
    if (expected === actual) return null

    return `${label}: esperado ${onOff(expected)}, real ${onOff(actual)}`
}

const ERROR_CHECK: ProviderCheck = {
    present: false,
    drift: false,
    detail: 'error al consultar el proveedor',
}

// ── Chequeos puros (sin I/O): comparan la fila con lo observado ──

// Compara ubicaciones personalizadas (orden-insensible) desired (DB) vs real (NPM).
function locationsDrift(desired: CustomLocation[], actual: NpmProxyHostLocation[]): boolean {
    if (desired.length !== actual.length) return true

    const key = (path: string, scheme: string, host: string, port: number, advanced: string) =>
        `${path} ${scheme} ${host} ${port} ${advanced}`
    const desiredKeys = desired
        .map((l) => key(l.path, l.forwardScheme, l.forwardHost, l.forwardPort, l.advancedConfig ?? ''))
        .sort()
    const actualKeys = actual
        .map((l) => key(l.path, l.forward_scheme, l.forward_host, l.forward_port, l.advanced_config ?? ''))
        .sort()
    return desiredKeys.some((value, index) => value !== actualKeys[index])
}

function npmDrift(domain: Domain, host: NpmProxyHost): string[] {
    const opts = domain.npmOptions
    const checks: (string | null)[] = [
        fieldDrift('forward_scheme', domain.forwardScheme, host.forward_scheme),
        fieldDrift('forward_host', domain.forwardHost ?? '(vacío)', host.forward_host),
        fieldDrift('forward_port', domain.forwardPort ?? '(vacío)', host.forward_port),
        flagDrift('block_exploits', opts.blockExploits, intBool(host.block_exploits)),
        flagDrift('websockets', opts.websockets, intBool(host.allow_websocket_upgrade)),
        flagDrift('cache_assets', opts.cacheAssets, intBool(host.caching_enabled)),
        flagDrift('http2', opts.http2, intBool(host.http2_support)),
        flagDrift('hsts', opts.hsts, intBool(host.hsts_enabled)),
        flagDrift('hsts_subdomains', opts.hstsSubdomains ?? false, intBool(host.hsts_subdomains)),
        flagDrift('force_ssl', opts.forceSsl, intBool(host.ssl_forced)),
        flagDrift('trust_forwarded_proto', opts.trustForwardedProto ?? false, intBool(host.trust_forwarded_proto)),
    ]

    const issues = checks.filter((issue): issue is string => issue !== null)

    if ((host.advanced_config ?? '') !== (domain.advancedConfig ?? '')) {
        issues.push('advanced_config difiere')
    }

    if (locationsDrift(domain.customLocations ?? [], host.locations ?? [])) {
        issues.push('custom_locations difiere')
    }

    if (host.certificate_id === 0) {
        issues.push('sin certificado SSL')
    }

    return issues
}

export function npmCheck(domain: Domain, host: NpmProxyHost | undefined): ProviderCheck {
    if (!host) {
        return {
            present: false,
            drift: false,
            detail: 'no existe el proxy host en NPM',
        }
    }

    const issues = npmDrift(domain, host)

    return {
        present: true,
        drift: issues.length > 0,
        detail: issues.join(' · ') || undefined,
        reasons: issues.length > 0 ? issues : undefined,
    }
}

export function cloudflareCheck(
    domain: Domain,
    record: CfDnsRecord | undefined,
    defaults: { defaultPublicIp: string | null; defaultCname: string | null },
): ProviderCheck {
    if (!record) {
        return {
            present: false,
            drift: false,
            detail: 'no existe el registro en Cloudflare',
        }
    }

    const expectedContent = domain.cfContent ?? cloudflareDefaultContent(domain.cfRecordType, defaults)
    const issues: string[] = []

    if (record.type !== domain.cfRecordType) {
        issues.push(`tipo: esperado ${domain.cfRecordType}, real ${record.type}`)
    }

    if (expectedContent && record.content !== expectedContent) {
        issues.push(`content: esperado ${expectedContent}, real ${record.content}`)
    }

    if (record.proxied !== domain.cfProxied) {
        issues.push(`proxied: esperado ${onOff(domain.cfProxied)}, real ${onOff(record.proxied)}`)
    }

    return {
        present: true,
        drift: issues.length > 0,
        detail: issues.join(' · ') || undefined,
        reasons: issues.length > 0 ? issues : undefined,
    }
}

export function mikrotikCheck(entry: MikrotikDnsEntry | undefined, npmInternalIp: string): ProviderCheck {
    if (!entry) {
        return {
            present: false,
            drift: false,
            detail: 'no existe la entrada DNS en el Mikrotik',
        }
    }

    const drift = entry.address !== npmInternalIp
    const reason = `address: esperado ${npmInternalIp}, real ${entry.address}`

    return {
        present: true,
        drift,
        detail: drift ? reason : undefined,
        reasons: drift ? [reason] : undefined,
    }
}

export function resolveState(input: {
    errored: boolean
    npm: ProviderCheck
    dns: ProviderCheck
    // Solo DNS: el estado agregado ignora NPM (no hay proxy host).
    dnsOnly?: boolean
}): ReconcileState {
    if (input.errored) return 'error'

    if (input.dnsOnly) {
        if (!input.dns.present) return 'missing'
        if (input.dns.drift) return 'drift'

        return 'synced'
    }

    if (!input.npm.present || !input.dns.present) return 'missing'
    if (input.npm.drift || input.dns.drift) return 'drift'

    return 'synced'
}

// Estado de UN proveedor (para su badge propio).
function checkState(check: ProviderCheck, errored: boolean): ReconcileState {
    if (errored) return 'error'
    if (!check.present) return 'missing'
    if (check.drift) return 'drift'

    return 'synced'
}

// ── Diff EN VIVO de un dominio (GET /api/domains/:id/status) ──

export async function diff(domain: Domain): Promise<DomainDiff> {
    const issues: string[] = []
    let npm: ProviderCheck
    let dns: ProviderCheck
    let enabledInNpm = false
    let errored = false

    if (domain.dnsOnly) {
        // Solo DNS: no hay proxy host; NPM no aplica.
        npm = { present: false, drift: false, detail: 'solo DNS: sin proxy host en NPM' }
    } else {
        try {
            const hosts = await listProxyHosts()
            const host = hosts.find((candidate) => candidate.domain_names.includes(domain.hostname))
            enabledInNpm = host ? isProxyHostEnabled(host) : false

            npm = npmCheck(domain, host)
        } catch (error) {
            errored = true

            npm = {
                present: false,
                drift: false,
                detail: (error as Error).message,
            }

            issues.push(`NPM: ${(error as Error).message}`)
        }
    }

    try {
        if (domain.visibility === 'public') {
            const cf = await resolveCloudflare()
            const zoneId = domain.cfZoneId ?? cf.defaultZoneId
            if (!zoneId) {
                dns = { present: false, drift: false, detail: 'sin zona de Cloudflare configurada' }
            } else {
                const record = await findRecord({ token: cf.token, zoneId }, domain.hostname, domain.cfRecordType)
                dns = cloudflareCheck(domain, record ?? undefined, cf)
            }
        } else {
            const mk = await resolveMikrotik()
            const entries = await listStaticDns(mk)
            const expectedAddress = domain.dnsOnly ? (domain.dnsTarget ?? mk.npmInternalIp) : mk.npmInternalIp
            dns = mikrotikCheck(
                entries.find((entry) => entry.name === domain.hostname),
                expectedAddress,
            )
        }
    } catch (error) {
        errored = true

        dns = {
            present: false,
            drift: false,
            detail: (error as Error).message,
        }

        issues.push(`DNS: ${(error as Error).message}`)
    }

    // En solo-DNS, NPM no aplica: no lo listamos como incidencia.
    if (npm.detail && !domain.dnsOnly) {
        issues.push(`NPM: ${npm.detail}`)
    }

    if (dns.detail) {
        issues.push(`DNS: ${dns.detail}`)
    }

    // Reglas de borde en vivo (solo público proxied). Un fallo de Cloudflare no rompe el resto.
    let edge: EdgeRuleView[] = []
    if (domain.visibility === 'public' && domain.cfProxied) {
        try {
            edge = await edgeRuleViews(domain)
        } catch (error) {
            issues.push(`Edge: ${(error as Error).message}`)
        }
    }

    return {
        state: resolveState({ errored, npm, dns, dnsOnly: domain.dnsOnly }),
        npm,
        dns,
        enabledInNpm,
        issues,
        edge,
    }
}

// Estado EN VIVO de un dominio, con el desglose por proveedor para sus badges.
export interface FleetEntry {
    state: ReconcileState // agregado (peor de los dos) — para el glow de la fila
    npm: ReconcileState | null // null en solo-DNS (NPM no aplica)
    dns: ReconcileState
}

// ── Estado EN VIVO de la flota (batcheado): una llamada por proveedor ──
// Comprueba cada dominio clasificado contra NPM (hosts ya obtenidos por el llamador) +
// la lista de Cloudflare (públicos) o del Mikrotik (privados). Un fallo de un proveedor
// solo marca 'error' a los dominios que dependen de él, no rompe el resto.

export async function computeFleetState(domains: Domain[], hosts: NpmProxyHost[]): Promise<Map<string, FleetEntry>> {
    const classified = domains.filter((domain) => domain.visibility !== 'unclassified')
    const needPrivate = classified.some((domain) => domain.visibility === 'private')
    const needPublic = classified.some((domain) => domain.visibility === 'public')

    let mikrotikError = false
    let entries: MikrotikDnsEntry[] = []
    let npmInternalIp = ''

    if (needPrivate) {
        try {
            const mk = await resolveMikrotik()
            npmInternalIp = mk.npmInternalIp
            entries = await listStaticDns(mk)
        } catch {
            mikrotikError = true
        }
    }

    let cloudflareError = false
    let records: CfDnsRecord[] = []
    let cfDefaults: { defaultPublicIp: string | null; defaultCname: string | null } = {
        defaultPublicIp: null,
        defaultCname: null,
    }

    if (needPublic) {
        try {
            const cf = await resolveCloudflare()
            cfDefaults = { defaultPublicIp: cf.defaultPublicIp, defaultCname: cf.defaultCname }
            // Multizona: agrupa los dominios públicos por su zona (o la del proveedor) y
            // lista los registros de cada zona distinta.
            const zoneIds = new Set<string>()
            for (const domain of classified) {
                if (domain.visibility !== 'public') continue

                const zoneId = domain.cfZoneId ?? cf.defaultZoneId
                if (zoneId) {
                    zoneIds.add(zoneId)
                }
            }

            for (const zoneId of zoneIds) {
                records.push(...(await listRecords({ token: cf.token, zoneId })))
            }
        } catch {
            cloudflareError = true
        }
    }

    // Un hostname puede tener varios registros (CNAME web + MX de correo, etc.): indexar
    // solo por nombre colapsaría duplicados y podría casar el registro equivocado. Se casa
    // por el id ya persistido (el nuestro) y, si aún no lo hay, por nombre + tipo deseado.
    const cfById = new Map(records.map((record) => [record.id, record]))
    const cfByNameType = new Map(records.map((record) => [cfKey(record.name, record.type), record]))
    const entryByName = new Map(entries.map((entry) => [entry.name, entry]))

    const stateById = new Map<string, FleetEntry>()

    for (const domain of classified) {
        // Solo-DNS no tiene proxy host: NPM no aplica (npm = null en el resultado).
        const npm = domain.dnsOnly
            ? undefined
            : npmCheck(
                  domain,
                  hosts.find((host) => host.domain_names.includes(domain.hostname)),
              )

        let dns: ProviderCheck
        let dnsErrored: boolean

        if (domain.visibility === 'public') {
            dnsErrored = cloudflareError
            const record =
                (domain.cloudflareRecordId ? cfById.get(domain.cloudflareRecordId) : undefined) ??
                cfByNameType.get(cfKey(domain.hostname, domain.cfRecordType))
            dns = cloudflareError ? ERROR_CHECK : cloudflareCheck(domain, record, cfDefaults)
        } else {
            dnsErrored = mikrotikError
            const expectedAddress = domain.dnsOnly ? (domain.dnsTarget ?? npmInternalIp) : npmInternalIp
            dns = mikrotikError ? ERROR_CHECK : mikrotikCheck(entryByName.get(domain.hostname), expectedAddress)
        }

        stateById.set(domain.id, {
            state: resolveState({ errored: dnsErrored, npm: npm ?? ERROR_CHECK, dns, dnsOnly: domain.dnsOnly }),
            npm: npm ? checkState(npm, false) : null,
            dns: checkState(dns, dnsErrored),
        })
    }

    return stateById
}

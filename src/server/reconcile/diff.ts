import type { ReconcileState } from '../../lib/domain-types'
import { env } from '../config/env'
import type { Domain } from '../db/schema'
import { findRecord, listRecords, type CfDnsRecord } from '../providers/cloudflare'
import { listStaticDns, type MikrotikDnsEntry } from '../providers/mikrotik'
import { listProxyHosts, type NpmProxyHost } from '../providers/npm'

// Compara el estado deseado (fila `Domain`) con el real (NPM + Cloudflare/Mikrotik) y
// deriva el estado de reconciliación. No modifica nada: solo lee.

export interface ProviderCheck {
    present: boolean
    drift: boolean
    detail?: string
}

export interface DomainDiff {
    state: ReconcileState
    npm: ProviderCheck
    dns: ProviderCheck
    issues: string[]
}

// NPM devuelve estos flags como boolean (v2.15) o como 0/1 según versión: toleramos ambos.
const intBool = (value: number | boolean): boolean => value === true || value === 1

const ERROR_CHECK: ProviderCheck = { present: false, drift: false, detail: 'error al consultar el proveedor' }

// ── Chequeos puros (sin I/O): comparan la fila con lo observado ──

function npmDrift(domain: Domain, host: NpmProxyHost): string[] {
    const issues: string[] = []
    if (host.forward_scheme !== domain.forwardScheme) {
        issues.push('forward_scheme difiere')
    }
    if (host.forward_host !== domain.forwardHost) {
        issues.push('forward_host difiere')
    }
    if (host.forward_port !== domain.forwardPort) {
        issues.push('forward_port difiere')
    }
    if (intBool(host.block_exploits) !== domain.npmOptions.blockExploits) {
        issues.push('block_exploits difiere')
    }
    if (intBool(host.allow_websocket_upgrade) !== domain.npmOptions.websockets) {
        issues.push('websockets difiere')
    }
    if (intBool(host.caching_enabled) !== domain.npmOptions.cacheAssets) {
        issues.push('cache_assets difiere')
    }
    if (intBool(host.http2_support) !== domain.npmOptions.http2) {
        issues.push('http2 difiere')
    }
    if (intBool(host.hsts_enabled) !== domain.npmOptions.hsts) {
        issues.push('hsts difiere')
    }
    if (intBool(host.ssl_forced) !== domain.npmOptions.forceSsl) {
        issues.push('force_ssl difiere')
    }
    if (host.certificate_id === 0) {
        issues.push('sin certificado SSL')
    }
    return issues
}

export function npmCheck(domain: Domain, host: NpmProxyHost | undefined): ProviderCheck {
    if (!host) {
        return { present: false, drift: false, detail: 'no existe el proxy host en NPM' }
    }
    const issues = npmDrift(domain, host)
    return { present: true, drift: issues.length > 0, detail: issues.join(', ') || undefined }
}

export function cloudflareCheck(domain: Domain, record: CfDnsRecord | undefined): ProviderCheck {
    if (!record) {
        return { present: false, drift: false, detail: 'no existe el registro en Cloudflare' }
    }
    const expectedContent = domain.cfContent ?? env.PUBLIC_IP
    const issues: string[] = []
    if (record.type !== domain.cfRecordType) {
        issues.push('tipo difiere')
    }
    if (expectedContent && record.content !== expectedContent) {
        issues.push('content difiere')
    }
    if (record.proxied !== domain.cfProxied) {
        issues.push('proxied difiere')
    }
    return { present: true, drift: issues.length > 0, detail: issues.join(', ') || undefined }
}

export function mikrotikCheck(domain: Domain, entry: MikrotikDnsEntry | undefined): ProviderCheck {
    if (!entry) {
        return { present: false, drift: false, detail: 'no existe la entrada DNS en el Mikrotik' }
    }
    const drift = entry.address !== env.NPM_INTERNAL_IP
    return { present: true, drift, detail: drift ? 'address difiere' : undefined }
}

export function resolveState(input: { errored: boolean; npm: ProviderCheck; dns: ProviderCheck }): ReconcileState {
    if (input.errored) {
        return 'error'
    }
    if (!input.npm.present || !input.dns.present) {
        return 'missing'
    }
    if (input.npm.drift || input.dns.drift) {
        return 'drift'
    }
    return 'synced'
}

// ── Diff EN VIVO de un dominio (GET /api/domains/:id/status) ──

export async function diff(domain: Domain): Promise<DomainDiff> {
    const issues: string[] = []
    let npm: ProviderCheck
    let dns: ProviderCheck
    let errored = false

    try {
        const hosts = await listProxyHosts()
        npm = npmCheck(
            domain,
            hosts.find((host) => host.domain_names.includes(domain.hostname)),
        )
    } catch (error) {
        errored = true
        npm = { present: false, drift: false, detail: (error as Error).message }
        issues.push(`NPM: ${(error as Error).message}`)
    }

    try {
        if (domain.visibility === 'public') {
            const record = await findRecord(domain.hostname)
            dns = cloudflareCheck(domain, record ?? undefined)
        } else {
            const entries = await listStaticDns()
            dns = mikrotikCheck(
                domain,
                entries.find((entry) => entry.name === domain.hostname),
            )
        }
    } catch (error) {
        errored = true
        dns = { present: false, drift: false, detail: (error as Error).message }
        issues.push(`DNS: ${(error as Error).message}`)
    }

    if (npm.detail) {
        issues.push(`NPM: ${npm.detail}`)
    }
    if (dns.detail) {
        issues.push(`DNS: ${dns.detail}`)
    }

    return { state: resolveState({ errored, npm, dns }), npm, dns, issues }
}

// ── Estado EN VIVO de la flota (batcheado): una llamada por proveedor ──
// Comprueba cada dominio clasificado contra NPM (hosts ya obtenidos por el llamador) +
// la lista de Cloudflare (públicos) o del Mikrotik (privados). Un fallo de un proveedor
// solo marca 'error' a los dominios que dependen de él, no rompe el resto.

export async function computeFleetState(
    domains: Domain[],
    hosts: NpmProxyHost[],
): Promise<Map<string, ReconcileState>> {
    const classified = domains.filter((domain) => domain.visibility !== 'unclassified')
    const needPrivate = classified.some((domain) => domain.visibility === 'private')
    const needPublic = classified.some((domain) => domain.visibility === 'public')

    let mikrotikError = false
    let entries: MikrotikDnsEntry[] = []
    if (needPrivate) {
        try {
            entries = await listStaticDns()
        } catch {
            mikrotikError = true
        }
    }

    let cloudflareError = false
    let records: CfDnsRecord[] = []
    if (needPublic) {
        try {
            records = await listRecords()
        } catch {
            cloudflareError = true
        }
    }

    const cfByName = new Map(records.map((record) => [record.name, record]))
    const entryByName = new Map(entries.map((entry) => [entry.name, entry]))

    const stateById = new Map<string, ReconcileState>()
    for (const domain of classified) {
        const npm = npmCheck(
            domain,
            hosts.find((host) => host.domain_names.includes(domain.hostname)),
        )

        let dns: ProviderCheck
        let dnsErrored: boolean
        if (domain.visibility === 'public') {
            dnsErrored = cloudflareError
            dns = cloudflareError ? ERROR_CHECK : cloudflareCheck(domain, cfByName.get(domain.hostname))
        } else {
            dnsErrored = mikrotikError
            dns = mikrotikError ? ERROR_CHECK : mikrotikCheck(domain, entryByName.get(domain.hostname))
        }

        stateById.set(domain.id, resolveState({ errored: dnsErrored, npm, dns }))
    }

    return stateById
}

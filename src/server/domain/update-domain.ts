import { eq } from 'drizzle-orm'
import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains, type Domain } from '../db/schema'
import { deleteRecord } from '../providers/cloudflare'
import { deleteStaticDns } from '../providers/mikrotik'
import { deleteProxyHost } from '../providers/npm'
import {
    cloudflareApiForDomain,
    cloudflareDefaultContent,
    getCloudflareDefaults,
    resolveMikrotik,
} from '../settings/dns-providers'
import { getDomainOrThrow } from './get-domain'
import { reconcileDomain } from './reconcile-domain'

// Edita la metadata de un dominio. Sin cambio de tipo NO toca proveedores (tras editar,
// el dominio queda en drift y se aplica con el botón). Al CAMBIAR público↔privado sí:
// borra el proveedor DNS antiguo y reconcilia para crear el nuevo.
export interface UpdateDomainInput {
    visibility?: 'public' | 'private'
    // Solo DNS: registra la resolución sin proxy host en NPM.
    dnsOnly?: boolean
    // Destino del A estático del Mikrotik en solo-DNS privado (null lo limpia).
    dnsTarget?: string | null
    forwardScheme?: ForwardScheme
    forwardHost?: string
    forwardPort?: number
    npmOptions?: NpmOptions
    customLocations?: CustomLocation[]
    advancedConfig?: string
    // number = cert existente; null = solicitar uno nuevo en la próxima reconciliación.
    certificateId?: number | null
    cfRecordType?: CfRecordType
    cfContent?: string | null
    cfProxied?: boolean
    cfZoneId?: string | null
    cfZoneName?: string | null
}

// Cambio de topología (visibilidad público↔privado y/o toggle solo-DNS): borra los recursos
// que dejan de aplicar (DNS del proveedor antiguo al cambiar de tipo; proxy host de NPM al
// pasar a solo-DNS), reajusta el estado deseado y reconcilia para crear/reparar el resto.
async function switchTopology(current: Domain, patch: UpdateDomainInput): Promise<Domain> {
    const nextVisibility = patch.visibility ?? current.visibility
    const nextDnsOnly = patch.dnsOnly ?? current.dnsOnly
    const isPublic = nextVisibility === 'public'
    const visibilityChanged = nextVisibility !== current.visibility
    const enablingDnsOnly = nextDnsOnly && !current.dnsOnly

    // 1) Borrar recursos que dejan de aplicar (best-effort: no bloquean el cambio).
    if (visibilityChanged && current.visibility === 'public' && current.cloudflareRecordId) {
        const recordId = current.cloudflareRecordId
        await cloudflareApiForDomain(current)
            .then((api) => deleteRecord(api, recordId))
            .catch(() => undefined)
    }

    if (visibilityChanged && current.visibility === 'private' && current.mikrotikDnsId) {
        const dnsId = current.mikrotikDnsId
        await resolveMikrotik()
            .then((mk) => deleteStaticDns(mk, dnsId))
            .catch(() => undefined)
    }

    // Al pasar a solo-DNS, el proxy host de NPM ya no se quiere: bórralo.
    if (enablingDnsOnly && current.npmProxyId) {
        await deleteProxyHost(current.npmProxyId).catch(() => undefined)
    }

    const cfRecordType = patch.cfRecordType ?? current.cfRecordType
    const cfDefaults = isPublic ? await getCloudflareDefaults() : { defaultPublicIp: null, defaultCname: null }

    // 2) Estado deseado nuevo: limpia ids que dejan de aplicar y re-deriva cert/SSL.
    const [updated] = await db
        .update(domains)
        .set({
            ...patch,
            visibility: nextVisibility,
            dnsOnly: nextDnsOnly,
            dnsTarget: nextDnsOnly && !isPublic ? (patch.dnsTarget ?? current.dnsTarget ?? null) : null,
            npmProxyId: enablingDnsOnly ? null : current.npmProxyId,
            cloudflareRecordId: visibilityChanged ? null : current.cloudflareRecordId,
            mikrotikDnsId: visibilityChanged ? null : current.mikrotikDnsId,
            certificateId: nextDnsOnly ? null : isPublic ? (patch.certificateId ?? null) : null,
            sslMode: nextDnsOnly ? null : isPublic ? 'new' : 'wildcard',
            cfContent: isPublic
                ? (patch.cfContent ?? current.cfContent ?? cloudflareDefaultContent(cfRecordType, cfDefaults) ?? null)
                : null,
            cfZoneId: isPublic ? (patch.cfZoneId ?? current.cfZoneId ?? null) : null,
            cfZoneName: isPublic ? (patch.cfZoneName ?? current.cfZoneName ?? null) : null,
            reconcileState: 'missing',
        })
        .where(eq(domains.id, current.id))
        .returning()

    // 3) Reconciliar para crear/reparar lo que aplique. Si falla, queda en 'error'.
    try {
        return await reconcileDomain(updated.id)
    } catch {
        return getDomainOrThrow(updated.id)
    }
}

export async function updateDomain(id: string, patch: UpdateDomainInput): Promise<Domain> {
    const current = await getDomainOrThrow(id)

    const visibilityChanged = patch.visibility !== undefined && patch.visibility !== current.visibility
    const dnsOnlyChanged = patch.dnsOnly !== undefined && patch.dnsOnly !== current.dnsOnly
    if (visibilityChanged || dnsOnlyChanged) {
        return switchTopology(current, patch)
    }

    if (Object.keys(patch).length === 0) {
        return current
    }

    const [saved] = await db.update(domains).set(patch).where(eq(domains.id, id)).returning()
    return saved
}

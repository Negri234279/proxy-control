import { eq } from 'drizzle-orm'
import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'
import { env } from '../config/env'
import { db } from '../db/client'
import { domains, type Domain } from '../db/schema'
import { deleteRecord } from '../providers/cloudflare'
import { deleteStaticDns } from '../providers/mikrotik'
import { getDomainOrThrow } from './get-domain'
import { reconcileDomain } from './reconcile-domain'

// Edita la metadata de un dominio. Sin cambio de tipo NO toca proveedores (tras editar,
// el dominio queda en drift y se aplica con el botón). Al CAMBIAR público↔privado sí:
// borra el proveedor DNS antiguo y reconcilia para crear el nuevo.
export interface UpdateDomainInput {
    visibility?: 'public' | 'private'
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
}

// Cambio de tipo: borra el DNS del proveedor antiguo (Cloudflare/Mikrotik), reajusta el
// estado deseado (limpia ids y re-deriva el cert) y reconcilia para crear el nuevo.
async function switchVisibility(current: Domain, patch: UpdateDomainInput): Promise<Domain> {
    const isPublic = patch.visibility === 'public'

    // 1) Borrar el proveedor antiguo (best-effort: no bloquea el cambio).
    if (current.visibility === 'public' && current.cloudflareRecordId) {
        await deleteRecord(current.cloudflareRecordId).catch(() => undefined)
    }
    if (current.visibility === 'private' && current.mikrotikDnsId) {
        await deleteStaticDns(current.mikrotikDnsId).catch(() => undefined)
    }

    // 2) Estado deseado nuevo: limpia ids del proveedor antiguo y re-deriva el certificado.
    const [updated] = await db
        .update(domains)
        .set({
            ...patch,
            visibility: patch.visibility,
            cloudflareRecordId: null,
            mikrotikDnsId: null,
            certificateId: isPublic ? (patch.certificateId ?? null) : null,
            sslMode: isPublic ? 'new' : 'wildcard',
            cfContent: isPublic ? (patch.cfContent ?? current.cfContent ?? env.PUBLIC_IP ?? null) : null,
            reconcileState: 'missing',
        })
        .where(eq(domains.id, current.id))
        .returning()

    // 3) Aplicar el nuevo proveedor (crea CF o Mikrotik + ajusta el cert de NPM). Si falla,
    //    queda en 'error' y se reintenta con el botón.
    try {
        return await reconcileDomain(updated.id)
    } catch {
        return getDomainOrThrow(updated.id)
    }
}

export async function updateDomain(id: string, patch: UpdateDomainInput): Promise<Domain> {
    const current = await getDomainOrThrow(id)

    if (patch.visibility && patch.visibility !== current.visibility) {
        return switchVisibility(current, patch)
    }

    if (Object.keys(patch).length === 0) {
        return current
    }

    const [saved] = await db.update(domains).set(patch).where(eq(domains.id, id)).returning()
    return saved
}

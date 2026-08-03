import { eq } from 'drizzle-orm'
import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains, type Domain } from '../db/schema'
import { getDomainOrThrow } from './get-domain'

// Edita la metadata de un dominio en la DB. No toca los proveedores: tras editar, el
// dominio suele quedar en drift y se aplica con el botón de reconciliar.
export interface UpdateDomainInput {
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

export async function updateDomain(id: string, patch: UpdateDomainInput): Promise<Domain> {
    if (Object.keys(patch).length === 0) {
        return getDomainOrThrow(id)
    }

    await getDomainOrThrow(id)

    const [saved] = await db.update(domains).set(patch).where(eq(domains.id, id)).returning()
    return saved
}

import {
    DEFAULT_NPM_OPTIONS,
    type CfRecordType,
    type CustomLocation,
    type ForwardScheme,
    type NpmOptions,
} from '../../lib/domain-types'
import { env } from '../config/env'
import { db } from '../db/client'
import { domains, type Domain, type NewDomain } from '../db/schema'
import { ValidationError } from '../errors'
import { getDomainOrThrow } from './get-domain'
import { reconcileDomain } from './reconcile-domain'

export interface CreateDomainInput {
    hostname: string
    visibility: 'public' | 'private'
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
    npmOptions?: NpmOptions
    customLocations?: CustomLocation[]
    advancedConfig?: string
    // Certificado SSL: 'new' (solicitar uno nuevo de Let's Encrypt) o el id de un cert
    // existente en NPM (p. ej. el wildcard *.negri.es). undefined = default por tipo.
    certificateId?: number | 'new'
    // Solo público:
    cfRecordType?: CfRecordType
    cfContent?: string
    cfProxied?: boolean
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505'
    )
}

// Alta de dominio (estado-deseado-primero): persiste la fila deseada y delega en la
// reconciliación, que crea CF/Mikrotik (antes) y luego NPM. Si la reconciliación falla,
// la fila queda en 'error' y se devuelve igualmente para reintentar con el botón.
export async function createDomain(input: CreateDomainInput): Promise<Domain> {
    const isPublic = input.visibility === 'public'
    const usesExistingCert = typeof input.certificateId === 'number'
    // sslMode es informativo: 'new' solo si es público y va a emitir cert nuevo.
    const sslMode = isPublic && !usesExistingCert ? 'new' : 'wildcard'

    const row: NewDomain = {
        hostname: input.hostname,
        visibility: input.visibility,
        forwardScheme: input.forwardScheme,
        forwardHost: input.forwardHost,
        forwardPort: input.forwardPort,
        npmOptions: input.npmOptions ?? DEFAULT_NPM_OPTIONS,
        customLocations: input.customLocations ?? [],
        advancedConfig: input.advancedConfig ?? '',
        // Cert elegido: número = existente; 'new'/undefined = solicitar nuevo (público).
        certificateId: usesExistingCert ? (input.certificateId as number) : null,
        sslMode,
        cfRecordType: input.cfRecordType ?? 'A',
        cfContent: isPublic ? (input.cfContent ?? env.PUBLIC_IP ?? null) : null,
        cfProxied: input.cfProxied ?? true,
        reconcileState: 'missing',
    }

    if (isPublic && row.cfRecordType === 'A' && !row.cfContent) {
        throw new ValidationError('Un dominio público con registro A necesita una IP', {
            cfContent: 'requerido (cfContent o PUBLIC_IP)',
        })
    }

    let inserted: Domain
    try {
        ;[inserted] = await db.insert(domains).values(row).returning()
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new ValidationError('Ya existe un dominio con ese hostname', { hostname: 'ya existe' })
        }
        throw error
    }

    try {
        return await reconcileDomain(inserted.id)
    } catch {
        // La fila ya quedó en 'error'; se devuelve para que la UI muestre el estado.
        return getDomainOrThrow(inserted.id)
    }
}

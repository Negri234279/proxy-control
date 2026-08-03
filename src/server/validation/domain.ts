import { z } from 'zod'
import type { CreateDomainInput } from '../domain/create-domain'
import type { UpdateDomainInput } from '../domain/update-domain'
import { ValidationError } from '../errors'
import { isHostname } from './hostname'
import { isIpv4 } from './ip'

// Validación de los payloads de la API con zod. Convierte los errores de zod en
// `ValidationError` (campo → mensaje) para el mapeo HTTP 400.

const npmOptionsSchema = z.object({
    blockExploits: z.boolean(),
    websockets: z.boolean(),
    cacheAssets: z.boolean(),
    http2: z.boolean(),
    hsts: z.boolean(),
    // Lenient con clientes antiguos que no envíen el flag nuevo.
    hstsSubdomains: z.boolean().default(false),
    forceSsl: z.boolean(),
})

const customLocationSchema = z.object({
    path: z.string().min(1),
    forwardScheme: z.enum(['http', 'https']),
    forwardHost: z.string().min(1),
    forwardPort: z.number().int().min(1).max(65535),
})

const forwardHostSchema = z.string().min(1)
const forwardPortSchema = z.number().int().min(1).max(65535)

const createSchema = z
    .object({
        hostname: z.string().refine(isHostname, 'hostname inválido'),
        visibility: z.enum(['public', 'private']),
        forwardScheme: z.enum(['http', 'https']),
        forwardHost: forwardHostSchema,
        forwardPort: forwardPortSchema,
        npmOptions: npmOptionsSchema.optional(),
        customLocations: z.array(customLocationSchema).optional(),
        cfRecordType: z.enum(['A', 'CNAME']).optional(),
        cfContent: z.string().min(1).optional(),
        cfProxied: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
        // Un registro A público debe apuntar a una IPv4 válida (o dejarse a PUBLIC_IP).
        if (
            value.visibility === 'public' &&
            value.cfRecordType !== 'CNAME' &&
            value.cfContent &&
            !isIpv4(value.cfContent)
        ) {
            ctx.addIssue({ code: 'custom', path: ['cfContent'], message: 'debe ser una IPv4 para un registro A' })
        }
    })

const updateSchema = z
    .object({
        forwardScheme: z.enum(['http', 'https']).optional(),
        forwardHost: forwardHostSchema.optional(),
        forwardPort: forwardPortSchema.optional(),
        npmOptions: npmOptionsSchema.optional(),
        customLocations: z.array(customLocationSchema).optional(),
        cfRecordType: z.enum(['A', 'CNAME']).optional(),
        cfContent: z.string().min(1).nullable().optional(),
        cfProxied: z.boolean().optional(),
    })
    .strict()

function toValidationError(error: z.ZodError): ValidationError {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
        fields[issue.path.join('.') || '_'] = issue.message
    }
    return new ValidationError('Datos inválidos', fields)
}

export function parseCreateDomainInput(body: unknown): CreateDomainInput {
    const result = createSchema.safeParse(body)
    if (!result.success) {
        throw toValidationError(result.error)
    }
    return result.data
}

export function parseUpdateDomainInput(body: unknown): UpdateDomainInput {
    const result = updateSchema.safeParse(body)
    if (!result.success) {
        throw toValidationError(result.error)
    }
    return result.data
}

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
    // Lenient con clientes antiguos que no envíen los flags nuevos.
    hstsSubdomains: z.boolean().default(false),
    forceSsl: z.boolean(),
    trustForwardedProto: z.boolean().default(false),
})

const customLocationSchema = z.object({
    path: z.string().min(1),
    forwardScheme: z.enum(['http', 'https']),
    forwardHost: z.string().min(1),
    forwardPort: z.number().int().min(1).max(65535),
    advancedConfig: z.string().default(''),
})

const forwardHostSchema = z.string().min(1)
const forwardPortSchema = z.number().int().min(1).max(65535)

const createSchema = z
    .object({
        hostname: z.string().refine(isHostname, 'hostname inválido'),
        visibility: z.enum(['public', 'private']),
        // Solo DNS: registra la resolución sin crear proxy host en NPM.
        dnsOnly: z.boolean().optional(),
        // Destino del A estático del Mikrotik en solo-DNS privado.
        dnsTarget: z.string().min(1).optional(),
        forwardScheme: z.enum(['http', 'https']),
        // Upstream opcional aquí: se exige en superRefine solo cuando NO es solo-DNS.
        forwardHost: forwardHostSchema.optional(),
        forwardPort: forwardPortSchema.optional(),
        npmOptions: npmOptionsSchema.optional(),
        customLocations: z.array(customLocationSchema).optional(),
        advancedConfig: z.string().optional(),
        certificateId: z.union([z.literal('new'), z.number().int().positive()]).optional(),
        cfRecordType: z.enum(['A', 'CNAME']).optional(),
        cfContent: z.string().min(1).optional(),
        cfProxied: z.boolean().optional(),
        cfZoneId: z.string().min(1).optional(),
        cfZoneName: z.string().min(1).optional(),
    })
    .superRefine((value, ctx) => {
        // Sin solo-DNS hay proxy host: el upstream es obligatorio.
        if (!value.dnsOnly) {
            if (!value.forwardHost) {
                ctx.addIssue({ code: 'custom', path: ['forwardHost'], message: 'requerido' })
            }

            if (value.forwardPort === undefined) {
                ctx.addIssue({ code: 'custom', path: ['forwardPort'], message: 'requerido' })
            }
        }

        // Solo-DNS privado: el destino (IP del A estático del Mikrotik) es obligatorio.
        if (value.dnsOnly && value.visibility === 'private') {
            if (!value.dnsTarget) {
                ctx.addIssue({ code: 'custom', path: ['dnsTarget'], message: 'requerido (IP destino)' })
            } else if (!isIpv4(value.dnsTarget)) {
                ctx.addIssue({ code: 'custom', path: ['dnsTarget'], message: 'debe ser una IPv4' })
            }
        }

        // Solo-DNS público: el registro apunta directo al origen, así que el contenido es
        // obligatorio (no tiene sentido caer al PUBLIC_IP del gateway sin NPM detrás).
        if (value.dnsOnly && value.visibility === 'public' && !value.cfContent) {
            ctx.addIssue({ code: 'custom', path: ['cfContent'], message: 'requerido (destino del registro)' })
        }

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
        visibility: z.enum(['public', 'private']).optional(),
        dnsOnly: z.boolean().optional(),
        dnsTarget: z.string().min(1).nullable().optional(),
        forwardScheme: z.enum(['http', 'https']).optional(),
        forwardHost: forwardHostSchema.optional(),
        forwardPort: forwardPortSchema.optional(),
        npmOptions: npmOptionsSchema.optional(),
        customLocations: z.array(customLocationSchema).optional(),
        advancedConfig: z.string().optional(),
        certificateId: z.number().int().positive().nullable().optional(),
        cfRecordType: z.enum(['A', 'CNAME']).optional(),
        cfContent: z.string().min(1).nullable().optional(),
        cfProxied: z.boolean().optional(),
        cfZoneId: z.string().min(1).nullable().optional(),
        cfZoneName: z.string().min(1).nullable().optional(),
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

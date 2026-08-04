import { z } from 'zod'
import { descriptorFor } from '../../lib/dns-providers'
import type { CreateProviderInput, UpdateProviderInput } from '../settings/dns-providers'
import { ValidationError } from '../errors'

// Validación de los payloads del panel de proveedores DNS. El `scope` no se acepta del cliente:
// se deriva del descriptor del `kind` (fuente de verdad), evitando incoherencias.

const configSchema = z.record(z.string(), z.unknown())

const createSchema = z.object({
    kind: z.string().min(1),
    name: z.string().min(1),
    config: configSchema.default({}),
    secret: configSchema.nullish(),
    enabled: z.boolean().optional(),
})

const updateSchema = z
    .object({
        name: z.string().min(1).optional(),
        config: configSchema.optional(),
        secret: configSchema.optional(),
        enabled: z.boolean().optional(),
    })
    .strict()

function toValidationError(error: z.ZodError): ValidationError {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
        fields[issue.path.join('.') || '_'] = issue.message
    }
    return new ValidationError('Datos inválidos', fields)
}

export function parseCreateProviderInput(body: unknown): CreateProviderInput {
    const result = createSchema.safeParse(body)
    if (!result.success) {
        throw toValidationError(result.error)
    }

    const descriptor = descriptorFor(result.data.kind)
    if (!descriptor) {
        throw new ValidationError('Tipo de proveedor no soportado', { kind: 'desconocido' })
    }

    return {
        kind: result.data.kind,
        scope: descriptor.scope,
        name: result.data.name,
        config: result.data.config,
        secret: result.data.secret ?? null,
        enabled: result.data.enabled,
    }
}

export function parseUpdateProviderInput(body: unknown): UpdateProviderInput {
    const result = updateSchema.safeParse(body)
    if (!result.success) {
        throw toValidationError(result.error)
    }
    return result.data
}

import { z } from 'zod'
import { EDGE_RATE_LIMIT_PERIODS } from '../../lib/domain-types'

// Validación compartida del bloque `edge` (reglas de borde de Cloudflare) para ambas fuentes
// declarativas (labels de Docker y fichero YAML). Las expresiones NO llevan el host: el scoping
// `(http.host eq "<hostname>") and (...)` lo inyecta la reconciliación. Aquí solo validamos
// forma y normalizamos `characteristics` (Cloudflare exige `cf.colo.id`).

// Cloudflare requiere `cf.colo.id` en las características del rate limiting; si el usuario no
// declara ninguna, usamos `ip.src` (límite por IP) y añadimos siempre `cf.colo.id`.
function normalizeCharacteristics(input: string[]): string[] {
    const list = input.length > 0 ? [...input] : ['ip.src']
    if (!list.includes('cf.colo.id')) {
        list.push('cf.colo.id')
    }

    return list
}

// `z.coerce.number` acepta tanto el número nativo del YAML como el string de las labels Docker.
const periodSchema = z.coerce
    .number()
    .refine((value): value is number => (EDGE_RATE_LIMIT_PERIODS as readonly number[]).includes(value), {
        message: `period inválido (admitidos: ${EDGE_RATE_LIMIT_PERIODS.join(', ')})`,
    })

export const edgeWafEntrySchema = z
    .object({
        description: z.string().min(1),
        expression: z.string().min(1),
        action: z.literal('block').default('block'),
    })
    .strict()

export const edgeRateLimitEntrySchema = z
    .object({
        description: z.string().min(1),
        expression: z.string().min(1),
        requestsPerPeriod: z.coerce.number().int().positive(),
        period: periodSchema,
        mitigationTimeout: z.coerce.number().int().nonnegative(),
        action: z.literal('block').default('block'),
        characteristics: z.array(z.string().min(1)).default([]),
    })
    .strict()
    .superRefine((value, ctx) => {
        // Cloudflare exige que el tiempo de mitigación no sea menor que el periodo.
        if (value.mitigationTimeout < value.period) {
            ctx.addIssue({
                code: 'custom',
                path: ['mitigationTimeout'],
                message: 'debe ser >= period',
            })
        }
    })
    .transform((value) => ({
        ...value,
        characteristics: normalizeCharacteristics(value.characteristics),
    }))

// Bloque `edge` completo tal cual aparece en el YAML (las labels de Docker lo construyen por índice).
export const edgeBlockSchema = z
    .object({
        waf: z.array(edgeWafEntrySchema).default([]),
        rateLimit: z.array(edgeRateLimitEntrySchema).default([]),
    })
    .strict()

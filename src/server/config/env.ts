import { z } from 'zod'

// Validación del entorno de la APP en ejecución (SSR). Falla rápido y con un mensaje
// claro si falta o es inválida alguna variable. Se evalúa una sola vez al importarse.
//
// Nota: las herramientas de DB (drizzle.config.ts, db/migrate.ts) NO usan este módulo:
// leen solo la URL de Postgres de process.env para no exigir el resto de secretos al
// generar/aplicar migraciones.

const boolFromEnv = (fallback: boolean) =>
    z
        .enum(['true', 'false'])
        .default(fallback ? 'true' : 'false')
        .transform((value) => value === 'true')

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
        HOST: z.string().min(1).default('0.0.0.0'),
        PORT: z.coerce.number().int().positive().default(4321),

        // Postgres (runtime): dev → directo; prod → pgbouncer.
        DATABASE_URL: z.string().min(1),

        // Nginx Proxy Manager.
        NPM_BASE_URL: z.string().min(1),
        NPM_EMAIL: z.string().min(1),
        NPM_PASSWORD: z.string().min(1),

        // Cloudflare (dominios públicos).
        CLOUDFLARE_API_TOKEN: z.string().min(1),
        CLOUDFLARE_ZONE_ID: z.string().min(1),
        PUBLIC_IP: z.string().min(1).optional(),

        // Mikrotik (dominios privados, REST RouterOS 7).
        MIKROTIK_BASE_URL: z.string().min(1),
        MIKROTIK_USER: z.string().min(1),
        MIKROTIK_PASSWORD: z.string().min(1),
        MIKROTIK_TLS_INSECURE: boolFromEnv(false),

        // IP interna de NPM: destino de las entradas DNS estáticas privadas.
        NPM_INTERNAL_IP: z.string().min(1),

        // Auth del panel.
        AUTH_ENABLED: boolFromEnv(true),
        AUTH_USER: z.string().min(1).optional(),
        AUTH_PASSWORD_HASH: z.string().min(1).optional(),
        SESSION_SECRET: z.string().min(1),
    })
    .superRefine((value, ctx) => {
        if (!value.AUTH_ENABLED) {
            return
        }
        if (!value.AUTH_USER) {
            ctx.addIssue({ code: 'custom', path: ['AUTH_USER'], message: 'requerido cuando AUTH_ENABLED=true' })
        }
        if (!value.AUTH_PASSWORD_HASH) {
            ctx.addIssue({
                code: 'custom',
                path: ['AUTH_PASSWORD_HASH'],
                message: 'requerido cuando AUTH_ENABLED=true',
            })
        }
    })

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`Variables de entorno inválidas:\n${details}`)
}

export const env = parsed.data

export type Env = typeof env

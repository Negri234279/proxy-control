import { z } from 'zod'

// Validación del entorno de la APP en ejecución (SSR). Falla rápido y con un mensaje
// claro si falta o es inválida alguna variable. Se evalúa una sola vez al importarse.
//
// Nota: las herramientas de DB (drizzle.config.ts, db/migrate.ts) NO usan este módulo:
// leen solo la URL de Postgres de process.env para no exigir el resto de secretos al
// generar/aplicar migraciones.

// En `astro dev` Vite carga el `.env` en `import.meta.env`, NO en `process.env`; en prod
// (node standalone) el entorno ya viene inyectado en el proceso. Cargamos el `.env` en
// `process.env` de forma best-effort para que ambos caminos funcionen con la misma lectura.
try {
    process.loadEnvFile()
} catch {
    // Sin `.env` (prod / CI): se usan las variables ya presentes en el entorno.
}

const boolFromEnv = (fallback: boolean) =>
    z
        .enum(['true', 'false'])
        .default(fallback ? 'true' : 'false')
        .transform((value) => value === 'true')

const schema = z
    .object({
        NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
        HOST: z.string().min(1).default('0.0.0.0'),
        PORT: z.coerce.number().int().positive().default(4321),

        // Postgres (runtime): dev → directo; prod → pgbouncer.
        DATABASE_URL: z.string().min(1),

        // Nginx Proxy Manager.
        NPM_BASE_URL: z.string().min(1),
        NPM_EMAIL: z.string().min(1),
        NPM_PASSWORD: z.string().min(1),

        // Cloudflare / Mikrotik: LEGACY. La config de proveedores DNS vive ahora en la DB
        // (tabla dns_providers, editable por panel). Si estas vars están presentes se usan
        // SOLO para el seed inicial (compatibilidad con despliegues previos). Opcionales.
        CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
        CLOUDFLARE_ZONE_ID: z.string().min(1).optional(),
        PUBLIC_IP: z.string().min(1).optional(),

        MIKROTIK_BASE_URL: z.string().min(1).optional(),
        MIKROTIK_USER: z.string().min(1).optional(),
        MIKROTIK_PASSWORD: z.string().min(1).optional(),
        MIKROTIK_TLS_INSECURE: boolFromEnv(false),

        // IP interna de NPM: destino de las entradas DNS estáticas privadas (legacy → seed).
        NPM_INTERNAL_IP: z.string().min(1).optional(),

        // Auth del panel.
        AUTH_ENABLED: boolFromEnv(true),
        AUTH_USER: z.string().min(1).optional(),
        AUTH_PASSWORD_HASH: z.string().min(1).optional(),
        SESSION_SECRET: z.string().min(1),

        // Clave para cifrar los secretos de proveedores DNS en la DB (AES-256-GCM). Se deriva
        // a 32 bytes con SHA-256, así que admite cualquier passphrase suficientemente larga.
        SETTINGS_KEY: z.string().min(16),

        // Descubrimiento de dominios por labels de Docker (estilo Traefik). Deshabilitado por
        // defecto. Con DOCKER_HOST se usa un endpoint tcp://; si no, el socket unix local.
        DOCKER_LABELS_ENABLED: boolFromEnv(false),
        DOCKER_SOCKET_PATH: z.string().min(1).default('/var/run/docker.sock'),
        DOCKER_HOST: z.string().min(1).optional(),
        DOCKER_LABEL_PREFIX: z.string().min(1).default('proxy-control'),
        // Resync periódico de seguridad (ms) y ventana de debounce para agrupar eventos.
        DOCKER_RESYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
        DOCKER_EVENT_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(500),
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

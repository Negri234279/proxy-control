import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import type { DomainSpec } from './domain-spec'
import { isHostname } from './hostname'

// Traduce un fichero YAML de dominios estáticos (servicios que NO son contenedores, p. ej.
// paneles de Proxmox/TrueNAS) a especificaciones de dominio. Mismo vocabulario que las labels
// de Docker, pero en YAML nativo (tipos reales, no strings). Política: todo explícito.
//
// Forma esperada:
//   domains:
//     - hostname: pve-web.negri.es
//       visibility: private
//       forward: { scheme: https, host: 192.168.1.10, port: 8006 }
//       npm: { websockets: true }                 # flags opcionales (ver NpmOptions)
//       ssl: { certificateId: 12 }                # opcional (cert existente en NPM)
//       advancedConfig: |                          # opcional (nginx en crudo)
//         ...
//       locations:                                 # opcional (NPM locations[])
//         - { path: /api, forward: { host: x, port: 1 } }
//       cloudflare: { recordType: A, content: 203.0.113.10, proxied: true, zoneId: abc }  # solo public

const forwardSchema = z.object({
    scheme: z.enum(['http', 'https']).default('http'),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
})

const npmOptionsSchema = z
    .object({
        blockExploits: z.boolean().optional(),
        websockets: z.boolean().optional(),
        cacheAssets: z.boolean().optional(),
        http2: z.boolean().optional(),
        hsts: z.boolean().optional(),
        hstsSubdomains: z.boolean().optional(),
        forceSsl: z.boolean().optional(),
        trustForwardedProto: z.boolean().optional(),
    })
    .strict()

const locationSchema = z
    .object({
        path: z.string().min(1),
        forward: forwardSchema,
        advancedConfig: z.string().default(''),
    })
    .transform((loc) => ({
        path: loc.path,
        forwardScheme: loc.forward.scheme,
        forwardHost: loc.forward.host,
        forwardPort: loc.forward.port,
        advancedConfig: loc.advancedConfig,
    }))

const cloudflareSchema = z
    .object({
        recordType: z.enum(['A', 'CNAME']).optional(),
        content: z.string().min(1).optional(),
        proxied: z.boolean().optional(),
        zoneId: z.string().min(1).optional(),
    })
    .strict()

const entrySchema = z
    .object({
        hostname: z.string().refine(isHostname, 'hostname inválido'),
        visibility: z.enum(['public', 'private']),
        forward: forwardSchema,
        npm: npmOptionsSchema.optional(),
        advancedConfig: z.string().optional(),
        locations: z.array(locationSchema).optional(),
        ssl: z.object({ certificateId: z.number().int().positive().optional() }).strict().optional(),
        cloudflare: cloudflareSchema.optional(),
    })
    .strict()

type Entry = z.infer<typeof entrySchema>

export interface FileDomainError {
    hostname: string
    error: string
}

function toSpec(entry: Entry): DomainSpec {
    return {
        hostname: entry.hostname,
        visibility: entry.visibility,
        forwardScheme: entry.forward.scheme,
        forwardHost: entry.forward.host,
        forwardPort: entry.forward.port,
        ...(entry.npm ? { npmOptions: entry.npm } : {}),
        ...(entry.advancedConfig !== undefined ? { advancedConfig: entry.advancedConfig } : {}),
        ...(entry.locations ? { customLocations: entry.locations } : {}),
        ...(entry.ssl?.certificateId !== undefined ? { certificateId: entry.ssl.certificateId } : {}),
        ...(entry.cloudflare?.recordType ? { cfRecordType: entry.cloudflare.recordType } : {}),
        ...(entry.cloudflare?.content ? { cfContent: entry.cloudflare.content } : {}),
        ...(entry.cloudflare?.proxied !== undefined ? { cfProxied: entry.cloudflare.proxied } : {}),
        ...(entry.cloudflare?.zoneId ? { cfZoneId: entry.cloudflare.zoneId } : {}),
    }
}

function issueMessage(error: z.ZodError): string {
    return error.issues.map((issue) => `${issue.path.join('.') || '_'}: ${issue.message}`).join('; ')
}

// Parsea el contenido de un fichero YAML. NO lanza: agrupa errores por entrada (un dominio mal
// definido no invalida el resto del fichero); un YAML corrupto se reporta como error de fichero.
export function parseDomainsFile(text: string): { specs: DomainSpec[]; errors: FileDomainError[] } {
    let doc: unknown
    try {
        doc = parseYaml(text)
    } catch (error) {
        return { specs: [], errors: [{ hostname: '(yaml)', error: (error as Error).message }] }
    }

    // Fichero vacío o comentado: sin dominios, sin error.
    if (doc === null || doc === undefined) {
        return { specs: [], errors: [] }
    }

    const root = z.object({ domains: z.array(z.unknown()).default([]) }).safeParse(doc)
    if (!root.success) {
        return { specs: [], errors: [{ hostname: '(yaml)', error: 'se esperaba un objeto con la clave "domains"' }] }
    }

    const specs: DomainSpec[] = []
    const errors: FileDomainError[] = []

    root.data.domains.forEach((raw, index) => {
        const parsed = entrySchema.safeParse(raw)
        if (!parsed.success) {
            const hostname =
                raw && typeof raw === 'object' && 'hostname' in raw
                    ? String((raw as { hostname?: unknown }).hostname ?? `#${index}`)
                    : `#${index}`
            errors.push({ hostname, error: issueMessage(parsed.error) })
            return
        }

        specs.push(toSpec(parsed.data))
    })

    return { specs, errors }
}

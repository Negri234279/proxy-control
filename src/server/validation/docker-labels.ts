import { z } from 'zod'
import type { CustomLocation, NpmOptions } from '../../lib/domain-types'
import { ValidationError } from '../errors'
import type { DomainSpec, EdgeSpec } from './domain-spec'
import { edgeRateLimitEntrySchema, edgeWafEntrySchema } from './edge-rules'
import { isHostname } from './hostname'
import { isIpv4 } from './ip'

// Traduce las labels de un container Docker (namespace configurable, p. ej. `proxy-control.*`)
// a una especificación de dominio. Política v1: TODO explícito (visibility, forward.host y
// forward.port son obligatorios; sin inferencia). Un solo hostname por container.

// Mapeo de flags de NPM: label (kebab) → clave de NpmOptions (camel).
const NPM_OPTION_LABELS: Record<string, keyof NpmOptions> = {
    'block-exploits': 'blockExploits',
    websockets: 'websockets',
    'cache-assets': 'cacheAssets',
    http2: 'http2',
    hsts: 'hsts',
    'hsts-subdomains': 'hstsSubdomains',
    'force-ssl': 'forceSsl',
    'trust-forwarded-proto': 'trustForwardedProto',
}

// Spec derivada de labels. Es la spec de dominio genérica (compartida con otras fuentes).
export type DockerDomainSpec = DomainSpec

const boolLabel = z.enum(['true', 'false']).transform((value) => value === 'true')

// Ubicación personalizada (NPM `locations[]`) declarada con labels indexadas:
//   <prefix>.location[N].path / .forward.host / .forward.port / .forward.scheme / .advanced-config
const locationSchema = z.object({
    path: z.string().min(1),
    forwardScheme: z.enum(['http', 'https']).default('http'),
    forwardHost: z.string().min(1),
    forwardPort: z.coerce.number().int().min(1).max(65535),
    advancedConfig: z.string().default(''),
})

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const specSchema = z
    .object({
        hostname: z.string().refine(isHostname, 'hostname inválido'),
        visibility: z.enum(['public', 'private']),
        // Solo DNS: registra la resolución sin proxy host en NPM.
        dnsOnly: boolLabel.optional(),
        // Destino del A estático del Mikrotik en solo-DNS privado (IP del servicio real).
        dnsTarget: z.string().min(1).optional(),
        forwardScheme: z.enum(['http', 'https']).default('http'),
        // Upstream opcional: se exige solo cuando NO es solo-DNS.
        forwardHost: z.string().min(1).optional(),
        forwardPort: z.coerce.number().int().min(1).max(65535).optional(),
        certificateId: z.coerce.number().int().positive().optional(),
        cfRecordType: z.enum(['A', 'CNAME']).optional(),
        cfContent: z.string().min(1).optional(),
        cfProxied: boolLabel.optional(),
        cfZoneId: z.string().min(1).optional(),
    })
    .superRefine((value, ctx) => {
        // Con proxy host (no solo-DNS), el upstream es obligatorio.
        if (!value.dnsOnly) {
            if (!value.forwardHost) {
                ctx.addIssue({ code: 'custom', path: ['forward.host'], message: 'requerido salvo en dns-only' })
            }

            if (value.forwardPort === undefined) {
                ctx.addIssue({ code: 'custom', path: ['forward.port'], message: 'requerido salvo en dns-only' })
            }
        }

        // Solo-DNS privado: el destino (IP del A estático del Mikrotik) es obligatorio.
        if (value.dnsOnly && value.visibility === 'private') {
            if (!value.dnsTarget) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['address'],
                    message: 'requerido (IP destino) en dns-only privado',
                })
            } else if (!isIpv4(value.dnsTarget)) {
                ctx.addIssue({ code: 'custom', path: ['address'], message: 'debe ser una IPv4' })
            }
        }

        // Solo-DNS público: el registro apunta directo al origen → contenido obligatorio.
        if (value.dnsOnly && value.visibility === 'public' && !value.cfContent) {
            ctx.addIssue({
                code: 'custom',
                path: ['cf.content'],
                message: 'requerido (destino del registro) en dns-only público',
            })
        }
    })

function toValidationError(error: z.ZodError, hostname: string, keyPrefix = ''): ValidationError {
    const fields: Record<string, string> = {}
    for (const issue of error.issues) {
        fields[`${keyPrefix}${issue.path.join('.') || '_'}`] = issue.message
    }

    return new ValidationError(`Labels de Docker inválidas${hostname ? ` para ${hostname}` : ''}`, fields)
}

// Ubicaciones personalizadas: agrupa las labels `location[N].*` por índice y las valida en orden.
function parseLocations(
    labels: Record<string, string>,
    prefix: string,
    hostname: string,
): CustomLocation[] | undefined {
    const indexRe = new RegExp(`^${escapeRegExp(prefix)}\\.location\\[(\\d+)\\]\\.`)
    const indices = new Set<number>()

    for (const key of Object.keys(labels)) {
        const match = key.match(indexRe)
        if (match) {
            indices.add(Number(match[1]))
        }
    }

    if (indices.size === 0) {
        return undefined
    }

    const locations: CustomLocation[] = []

    for (const index of [...indices].sort((a, b) => a - b)) {
        const base = `${prefix}.location[${index}]`
        const result = locationSchema.safeParse({
            path: labels[`${base}.path`],
            forwardScheme: labels[`${base}.forward.scheme`],
            forwardHost: labels[`${base}.forward.host`],
            forwardPort: labels[`${base}.forward.port`],
            advancedConfig: labels[`${base}.advanced-config`],
        })

        if (!result.success) {
            throw toValidationError(result.error, hostname, `location[${index}].`)
        }

        locations.push(result.data)
    }

    return locations
}

// Índices declarados para una clave indexada `<base>[N].` (ordenados ascendentemente).
function collectIndices(labels: Record<string, string>, re: RegExp): number[] {
    const indices = new Set<number>()
    for (const key of Object.keys(labels)) {
        const match = key.match(re)
        if (match) {
            indices.add(Number(match[1]))
        }
    }

    return [...indices].sort((a, b) => a - b)
}

// Reglas de borde declaradas por labels indexadas:
//   <prefix>.edge.waf[N].description / .expression / .action
//   <prefix>.edge.ratelimit[N].description / .expression / .requests-per-period / .period /
//     .mitigation-timeout / .characteristics (CSV) / .action
function parseEdge(labels: Record<string, string>, prefix: string, hostname: string): EdgeSpec | undefined {
    const wafRe = new RegExp(`^${escapeRegExp(prefix)}\\.edge\\.waf\\[(\\d+)\\]\\.`)
    const rlRe = new RegExp(`^${escapeRegExp(prefix)}\\.edge\\.ratelimit\\[(\\d+)\\]\\.`)
    const wafIndices = collectIndices(labels, wafRe)
    const rlIndices = collectIndices(labels, rlRe)

    if (wafIndices.length === 0 && rlIndices.length === 0) {
        return undefined
    }

    const waf: EdgeSpec['waf'] = []
    for (const index of wafIndices) {
        const base = `${prefix}.edge.waf[${index}]`
        const result = edgeWafEntrySchema.safeParse({
            description: labels[`${base}.description`],
            expression: labels[`${base}.expression`],
            action: labels[`${base}.action`],
        })

        if (!result.success) {
            throw toValidationError(result.error, hostname, `edge.waf[${index}].`)
        }

        waf.push(result.data)
    }

    const rateLimit: EdgeSpec['rateLimit'] = []
    for (const index of rlIndices) {
        const base = `${prefix}.edge.ratelimit[${index}]`
        const rawCharacteristics = labels[`${base}.characteristics`]
        const result = edgeRateLimitEntrySchema.safeParse({
            description: labels[`${base}.description`],
            expression: labels[`${base}.expression`],
            requestsPerPeriod: labels[`${base}.requests-per-period`],
            period: labels[`${base}.period`],
            mitigationTimeout: labels[`${base}.mitigation-timeout`],
            action: labels[`${base}.action`],
            characteristics: rawCharacteristics
                ? rawCharacteristics
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                : undefined,
        })

        if (!result.success) {
            throw toValidationError(result.error, hostname, `edge.ratelimit[${index}].`)
        }

        rateLimit.push(result.data)
    }

    return { waf, rateLimit }
}

function parseNpmOptions(labels: Record<string, string>, prefix: string): Partial<NpmOptions> | undefined {
    const options: Partial<NpmOptions> = {}

    for (const [suffix, key] of Object.entries(NPM_OPTION_LABELS)) {
        const raw = labels[`${prefix}.npm.${suffix}`]
        if (raw === undefined) continue

        const parsed = boolLabel.safeParse(raw)
        if (!parsed.success) {
            throw new ValidationError('Labels de Docker inválidas', { [`npm.${suffix}`]: 'debe ser true|false' })
        }

        options[key] = parsed.data
    }

    return Object.keys(options).length > 0 ? options : undefined
}

// Devuelve la spec del container, o null si no está habilitado (`<prefix>.enable != true`).
// Lanza ValidationError si está habilitado pero las labels son inválidas/incompletas.
export function parseContainerLabels(labels: Record<string, string>, prefix: string): DockerDomainSpec | null {
    if (labels[`${prefix}.enable`] !== 'true') {
        return null
    }

    const hostname = labels[`${prefix}.hostname`] ?? ''
    const result = specSchema.safeParse({
        hostname,
        visibility: labels[`${prefix}.visibility`],
        dnsOnly: labels[`${prefix}.dns-only`],
        dnsTarget: labels[`${prefix}.address`],
        forwardScheme: labels[`${prefix}.forward.scheme`],
        forwardHost: labels[`${prefix}.forward.host`],
        forwardPort: labels[`${prefix}.forward.port`],
        certificateId: labels[`${prefix}.ssl.certificate-id`],
        cfRecordType: labels[`${prefix}.cf.record-type`],
        cfContent: labels[`${prefix}.cf.content`],
        cfProxied: labels[`${prefix}.cf.proxied`],
        cfZoneId: labels[`${prefix}.cf.zone-id`],
    })

    if (!result.success) {
        throw toValidationError(result.error, hostname)
    }

    const npmOptions = parseNpmOptions(labels, prefix)
    const customLocations = parseLocations(labels, prefix, hostname)
    const advancedConfig = labels[`${prefix}.advanced-config`]
    const edge = parseEdge(labels, prefix, hostname)

    // Las reglas de borde solo aplican a dominios públicos y proxied (CF las sirve en el borde).
    if (edge) {
        if (result.data.visibility !== 'public') {
            throw new ValidationError(`Labels de Docker inválidas para ${hostname}`, {
                edge: 'solo válido en dominios públicos',
            })
        }

        if (result.data.cfProxied === false) {
            throw new ValidationError(`Labels de Docker inválidas para ${hostname}`, {
                edge: 'requiere el dominio proxied en Cloudflare',
            })
        }
    }

    return {
        ...result.data,
        ...(npmOptions ? { npmOptions } : {}),
        ...(customLocations ? { customLocations } : {}),
        ...(advancedConfig !== undefined ? { advancedConfig } : {}),
        ...(edge ? { edge } : {}),
    }
}

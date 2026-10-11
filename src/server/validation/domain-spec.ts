import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'

// Regla WAF custom (fase http_request_firewall_custom). La expresión NO lleva el host: lo
// inyecta la reconciliación como `(http.host eq "<hostname>") and (<expresión>)`.
export interface EdgeWafSpec {
    description: string
    expression: string
    action: 'block'
}

// Regla de rate limiting (fase http_ratelimit). `characteristics` siempre incluye `cf.colo.id`.
export interface EdgeRateLimitSpec {
    description: string
    expression: string
    requestsPerPeriod: number
    period: number
    mitigationTimeout: number
    action: 'block'
    characteristics: string[]
}

// Bloque `edge` de un dominio: reglas de borde de Cloudflare (solo público + proxied).
export interface EdgeSpec {
    waf: EdgeWafSpec[]
    rateLimit: EdgeRateLimitSpec[]
}

// Especificación de un dominio derivada de una fuente declarativa (labels de Docker, fichero
// YAML, …). Es el formato intermedio que se traduce a la fila deseada del dominio y alimenta
// la reconciliación. No lleva lógica: solo la forma.
export interface DomainSpec {
    hostname: string
    visibility: 'public' | 'private'
    // Solo DNS: registra la resolución (CF/Mikrotik) sin crear proxy host en NPM. En ese
    // modo el upstream (forwardHost/Port) es opcional (no hay proxy que lo use).
    dnsOnly?: boolean
    // Destino del A estático del Mikrotik en solo-DNS privado (IP del servicio real).
    dnsTarget?: string
    forwardScheme: ForwardScheme
    forwardHost?: string
    forwardPort?: number
    npmOptions?: Partial<NpmOptions>
    advancedConfig?: string
    customLocations?: CustomLocation[]
    certificateId?: number
    cfRecordType?: CfRecordType
    cfContent?: string
    cfProxied?: boolean
    cfZoneId?: string
    // Reglas de borde de Cloudflare (solo válido en público proxied; los parsers lo rechazan si no).
    edge?: EdgeSpec
}

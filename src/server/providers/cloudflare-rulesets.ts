import { ProviderError } from '../errors'
import type { CloudflareApi } from './cloudflare'
import { cfJson } from './cloudflare-http'

// Cliente de Cloudflare Rulesets (reglas de borde: WAF custom + rate limiting). Sin lógica de
// negocio: resuelve/crea el ruleset entrypoint de una fase y hace CRUD de reglas por id. Opera
// sobre el entrypoint de ZONA de cada fase (`http_request_firewall_custom`, `http_ratelimit`).
// Docs: https://developers.cloudflare.com/ruleset-engine/

// Fases soportadas (una por tipo de regla de borde).
export const EDGE_PHASES = {
    waf: 'http_request_firewall_custom',
    ratelimit: 'http_ratelimit',
} as const

export type EdgePhase = (typeof EDGE_PHASES)[keyof typeof EDGE_PHASES]

export interface CfRulesetRule {
    id: string
    description: string
    expression: string
    action: string
    enabled: boolean
    ratelimit?: {
        characteristics: string[]
        period: number
        requests_per_period: number
        mitigation_timeout: number
    }
}

export interface CfRuleset {
    id: string
    phase: string
    rules?: CfRulesetRule[]
}

// Cuerpo de una regla al crear/editar (rate limiting incluye su bloque `ratelimit`).
export interface CfRuleInput {
    description: string
    expression: string
    action: 'block'
    enabled: boolean
    ratelimit?: {
        characteristics: string[]
        period: number
        requests_per_period: number
        mitigation_timeout: number
    }
}

// Traduce un 403 de Cloudflare en un mensaje de permisos claro (el token no tiene el scope de
// Rulesets). El resto de errores de proveedor se propagan tal cual.
function asPermissionError(error: unknown): never {
    if (error instanceof ProviderError && error.status === 403) {
        throw new ProviderError(
            'cloudflare',
            'El token de Cloudflare no tiene permiso de Rulesets (Zone WAF / Zone Rulesets). Revisa el scope del token.',
            { status: 403, cause: error },
        )
    }

    throw error
}

// Entrypoint de zona de una fase, o null si aún no existe (Cloudflare responde 404).
export async function getPhaseEntrypoint(api: CloudflareApi, phase: EdgePhase): Promise<CfRuleset | null> {
    try {
        return await cfJson<CfRuleset>(api.token, `/zones/${api.zoneId}/rulesets/phases/${phase}/entrypoint`)
    } catch (error) {
        if (error instanceof ProviderError && error.status === 404) {
            return null
        }

        asPermissionError(error)
    }
}

// Crea el ruleset entrypoint de zona de una fase (vacío). Solo se llama si no existía.
export async function createZoneRuleset(api: CloudflareApi, phase: EdgePhase): Promise<CfRuleset> {
    try {
        return await cfJson<CfRuleset>(api.token, `/zones/${api.zoneId}/rulesets`, {
            method: 'POST',
            body: JSON.stringify({
                name: `proxy-control ${phase}`,
                kind: 'zone',
                phase,
                rules: [],
            }),
        })
    } catch (error) {
        asPermissionError(error)
    }
}

// Añade una regla al ruleset. Cloudflare devuelve el ruleset completo (con la regla ya creada).
export async function addRule(api: CloudflareApi, rulesetId: string, rule: CfRuleInput): Promise<CfRuleset> {
    try {
        return await cfJson<CfRuleset>(api.token, `/zones/${api.zoneId}/rulesets/${rulesetId}/rules`, {
            method: 'POST',
            body: JSON.stringify(rule),
        })
    } catch (error) {
        asPermissionError(error)
    }
}

export async function updateRule(
    api: CloudflareApi,
    rulesetId: string,
    ruleId: string,
    rule: CfRuleInput,
): Promise<CfRuleset> {
    try {
        return await cfJson<CfRuleset>(api.token, `/zones/${api.zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, {
            method: 'PATCH',
            body: JSON.stringify(rule),
        })
    } catch (error) {
        asPermissionError(error)
    }
}

export async function deleteRule(api: CloudflareApi, rulesetId: string, ruleId: string): Promise<void> {
    try {
        await cfJson<unknown>(api.token, `/zones/${api.zoneId}/rulesets/${rulesetId}/rules/${ruleId}`, {
            method: 'DELETE',
        })
    } catch (error) {
        asPermissionError(error)
    }
}

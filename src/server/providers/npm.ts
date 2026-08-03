import type { CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'
import { env } from '../config/env'
import { fetchJson } from './http'

// Cliente de Nginx Proxy Manager. Aísla la API de NPM: sin lógica de negocio.
// Docs: https://nginxproxymanager.com/api/

const BASE = env.NPM_BASE_URL.replace(/\/$/, '')

// NPM devuelve los flags como boolean (v2.15) o 0/1 según versión: tipamos ambos.
export interface NpmProxyHost {
    id: number
    domain_names: string[]
    forward_scheme: string
    forward_host: string
    forward_port: number
    enabled: number | boolean
    certificate_id: number
    block_exploits: number | boolean
    allow_websocket_upgrade: number | boolean
    caching_enabled: number | boolean
    http2_support: number | boolean
    hsts_enabled: number | boolean
    hsts_subdomains: number | boolean
    ssl_forced: number | boolean
}

export interface NpmCertificate {
    id: number
    provider: string
    nice_name: string
    domain_names: string[]
}

export interface CreateProxyHostInput {
    hostname: string
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
    npmOptions: NpmOptions
    customLocations: CustomLocation[]
    // 'new' → NPM emite un cert nuevo de Let's Encrypt; número → cert existente (wildcard).
    certificateId: number | 'new'
    // Solo relevante con 'new': false = flujo estándar de NPM (sin DNS challenge).
    dnsChallenge: boolean
}

interface TokenResponse {
    token: string
    expires: string
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
        return cachedToken.value
    }

    const data = await fetchJson<TokenResponse>(`${BASE}/api/tokens`, {
        provider: 'npm',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: env.NPM_EMAIL, secret: env.NPM_PASSWORD }),
    })

    // Renovar 60s antes de la expiración real para evitar carreras.
    const expiresAt = new Date(data.expires).getTime() - 60_000

    cachedToken = {
        value: data.token,
        expiresAt,
    }

    return data.token
}

async function authedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken()

    return fetchJson<T>(`${BASE}${path}`, {
        ...init,
        provider: 'npm',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...init.headers,
        },
    })
}

export function listProxyHosts(): Promise<NpmProxyHost[]> {
    return authedJson<NpmProxyHost[]>('/api/nginx/proxy-hosts')
}

export function listCertificates(): Promise<NpmCertificate[]> {
    return authedJson<NpmCertificate[]>('/api/nginx/certificates')
}

function buildProxyHostBody(input: CreateProxyHostInput) {
    return {
        domain_names: [input.hostname],
        forward_scheme: input.forwardScheme,
        forward_host: input.forwardHost,
        forward_port: input.forwardPort,
        access_list_id: 0,
        certificate_id: input.certificateId,
        ssl_forced: input.npmOptions.forceSsl,
        hsts_enabled: input.npmOptions.hsts,
        hsts_subdomains: input.npmOptions.hstsSubdomains ?? false,
        http2_support: input.npmOptions.http2,
        block_exploits: input.npmOptions.blockExploits,
        caching_enabled: input.npmOptions.cacheAssets,
        allow_websocket_upgrade: input.npmOptions.websockets,
        advanced_config: '',
        enabled: true,
        locations: input.customLocations.map((location) => ({
            path: location.path,
            forward_scheme: location.forwardScheme,
            forward_host: location.forwardHost,
            forward_port: location.forwardPort,
            advanced_config: '',
        })),
        meta: {
            letsencrypt_agree: input.certificateId === 'new',
            dns_challenge: input.certificateId === 'new' ? input.dnsChallenge : false,
        },
    }
}

export function createProxyHost(input: CreateProxyHostInput): Promise<NpmProxyHost> {
    return authedJson<NpmProxyHost>('/api/nginx/proxy-hosts', {
        method: 'POST',
        body: JSON.stringify(buildProxyHostBody(input)),
    })
}

export function updateProxyHost(id: number, input: CreateProxyHostInput): Promise<NpmProxyHost> {
    return authedJson<NpmProxyHost>(`/api/nginx/proxy-hosts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(buildProxyHostBody(input)),
    })
}

export function deleteProxyHost(id: number): Promise<boolean> {
    return authedJson<boolean>(`/api/nginx/proxy-hosts/${id}`, { method: 'DELETE' })
}

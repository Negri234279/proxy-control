import type { CfRecordType } from '../../lib/domain-types'
import { ProviderError } from '../errors'
import { fetchJson } from './http'

// Cliente de Cloudflare (registros DNS de dominios públicos). Sin lógica de negocio ni
// estado: recibe las credenciales (`token` y, cuando aplica, `zoneId`) por parámetro, para
// soportar varias zonas/cuentas configuradas desde el panel.
// Docs: https://developers.cloudflare.com/api/

const BASE = 'https://api.cloudflare.com/client/v4'

// Marca los registros que gestiona esta app en el propio Cloudflare (visible en su UI).
const MANAGED_COMMENT = 'Creado desde proxy-control'

// Credenciales de una llamada con ámbito de zona.
export interface CloudflareApi {
    token: string
    zoneId: string
}

export interface CfDnsRecord {
    id: string
    type: string
    name: string
    content: string
    proxied: boolean
}

export interface CfZone {
    id: string
    name: string
}

export interface CreateRecordInput {
    name: string
    type: CfRecordType
    content: string
    proxied: boolean
}

interface CfEnvelope<T> {
    success: boolean
    errors: { code: number; message: string }[]
    result: T
}

async function cfJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const envelope = await fetchJson<CfEnvelope<T>>(`${BASE}${path}`, {
        ...init,
        provider: 'cloudflare',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...init.headers,
        },
    })

    if (!envelope.success) {
        const detail = envelope.errors.map((error) => `${error.code} ${error.message}`).join('; ')
        throw new ProviderError('cloudflare', `Cloudflare rechazó la petición: ${detail}`)
    }

    return envelope.result
}

// Todas las zonas accesibles con el token (para el selector de zona del formulario).
export function listZones(token: string): Promise<CfZone[]> {
    return cfJson<CfZone[]>(token, '/zones?per_page=50')
}

export async function findRecord(api: CloudflareApi, name: string, type?: CfRecordType): Promise<CfDnsRecord | null> {
    const query = new URLSearchParams({ name })
    if (type) {
        query.set('type', type)
    }
    
    const records = await cfJson<CfDnsRecord[]>(api.token, `/zones/${api.zoneId}/dns_records?${query.toString()}`)
    return records[0] ?? null
}

// Lista todos los registros de una zona (para comprobar en vivo la flota de una vez).
export function listRecords(api: CloudflareApi): Promise<CfDnsRecord[]> {
    return cfJson<CfDnsRecord[]>(api.token, `/zones/${api.zoneId}/dns_records?per_page=1000`)
}

export function createRecord(api: CloudflareApi, input: CreateRecordInput): Promise<CfDnsRecord> {
    return cfJson<CfDnsRecord>(api.token, `/zones/${api.zoneId}/dns_records`, {
        method: 'POST',
        body: JSON.stringify({
            type: input.type,
            name: input.name,
            content: input.content,
            proxied: input.proxied,
            comment: MANAGED_COMMENT,
            ttl: 1,
        }),
    })
}

export function updateRecord(api: CloudflareApi, id: string, input: CreateRecordInput): Promise<CfDnsRecord> {
    return cfJson<CfDnsRecord>(api.token, `/zones/${api.zoneId}/dns_records/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
            type: input.type,
            name: input.name,
            content: input.content,
            proxied: input.proxied,
            comment: MANAGED_COMMENT,
            ttl: 1,
        }),
    })
}

export function deleteRecord(api: CloudflareApi, id: string): Promise<{ id: string }> {
    return cfJson<{ id: string }>(api.token, `/zones/${api.zoneId}/dns_records/${id}`, { method: 'DELETE' })
}

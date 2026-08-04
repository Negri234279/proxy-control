import type { CfRecordType } from '../../lib/domain-types'
import { env } from '../config/env'
import { ProviderError } from '../errors'
import { fetchJson } from './http'

// Cliente de Cloudflare (registros DNS de dominios públicos). Sin lógica de negocio.
// Docs: https://developers.cloudflare.com/api/

const BASE = 'https://api.cloudflare.com/client/v4'
const ZONE = env.CLOUDFLARE_ZONE_ID

// Marca los registros que gestiona esta app en el propio Cloudflare (visible en su UI).
const MANAGED_COMMENT = 'Creado desde proxy-control'

export interface CfDnsRecord {
    id: string
    type: string
    name: string
    content: string
    proxied: boolean
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

async function cfJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const envelope = await fetchJson<CfEnvelope<T>>(`${BASE}${path}`, {
        ...init,
        provider: 'cloudflare',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            ...init.headers,
        },
    })

    if (!envelope.success) {
        const detail = envelope.errors.map((error) => `${error.code} ${error.message}`).join('; ')
        throw new ProviderError('cloudflare', `Cloudflare rechazó la petición: ${detail}`)
    }

    return envelope.result
}

export async function findRecord(name: string): Promise<CfDnsRecord | null> {
    const records = await cfJson<CfDnsRecord[]>(`/zones/${ZONE}/dns_records?name=${encodeURIComponent(name)}`)
    return records[0] ?? null
}

// Lista todos los registros de la zona (para comprobar en vivo la flota de una vez).
export function listRecords(): Promise<CfDnsRecord[]> {
    return cfJson<CfDnsRecord[]>(`/zones/${ZONE}/dns_records?per_page=1000`)
}

export function createRecord(input: CreateRecordInput): Promise<CfDnsRecord> {
    return cfJson<CfDnsRecord>(`/zones/${ZONE}/dns_records`, {
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

export function updateRecord(id: string, input: CreateRecordInput): Promise<CfDnsRecord> {
    return cfJson<CfDnsRecord>(`/zones/${ZONE}/dns_records/${id}`, {
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

export function deleteRecord(id: string): Promise<{ id: string }> {
    return cfJson<{ id: string }>(`/zones/${ZONE}/dns_records/${id}`, { method: 'DELETE' })
}

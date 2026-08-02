import { Buffer } from 'node:buffer'
import { Agent, request } from 'node:https'
import { env } from '../config/env'
import { ProviderError } from '../errors'

// Cliente del Mikrotik (RouterOS 7 REST API sobre www-ssl, 443). Usa node:https en vez
// de fetch para poder aceptar el certificado self-signed del router (MIKROTIK_TLS_INSECURE).
// Docs: https://help.mikrotik.com/docs/display/ROS/REST+API

const BASE = env.MIKROTIK_BASE_URL.replace(/\/$/, '') + '/rest'
const AUTH = 'Basic ' + Buffer.from(`${env.MIKROTIK_USER}:${env.MIKROTIK_PASSWORD}`).toString('base64')
const agent = new Agent({ rejectUnauthorized: !env.MIKROTIK_TLS_INSECURE })

export interface MikrotikDnsEntry {
    '.id': string
    name: string
    address: string
    type?: string
}

export interface CreateStaticDnsInput {
    name: string
    address: string
}

function mikrotikRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body)
        const headers: Record<string, string> = {
            Authorization: AUTH,
            Accept: 'application/json',
        }

        if (payload !== undefined) {
            headers['Content-Type'] = 'application/json'
            headers['Content-Length'] = String(Buffer.byteLength(payload))
        }

        const req = request(new URL(BASE + path), { method, agent, headers }, (res) => {
            const chunks: Buffer[] = []

            res.on('data', (chunk) => chunks.push(chunk as Buffer))
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8')
                const status = res.statusCode ?? 0

                if (status < 200 || status >= 300) {
                    reject(
                        new ProviderError('mikrotik', `Mikrotik respondió ${status}: ${text.slice(0, 300)}`, {
                            status,
                        }),
                    )
                    return
                }

                if (!text) {
                    resolve(undefined as T)
                    return
                }

                try {
                    resolve(JSON.parse(text) as T)
                } catch (cause) {
                    reject(new ProviderError('mikrotik', 'Respuesta no-JSON de Mikrotik', { cause }))
                }
            })
        })

        req.on('error', (cause) =>
            reject(new ProviderError('mikrotik', 'No se pudo contactar con Mikrotik', { cause })),
        )

        if (payload !== undefined) {
            req.write(payload)
        }
        
        req.end()
    })
}

export function listStaticDns(): Promise<MikrotikDnsEntry[]> {
    return mikrotikRequest<MikrotikDnsEntry[]>('GET', '/ip/dns/static')
}

export function createStaticDns(input: CreateStaticDnsInput): Promise<MikrotikDnsEntry> {
    return mikrotikRequest<MikrotikDnsEntry>('PUT', '/ip/dns/static', {
        name: input.name,
        address: input.address,
        type: 'A',
    })
}

export function deleteStaticDns(id: string): Promise<void> {
    return mikrotikRequest<void>('DELETE', `/ip/dns/static/${encodeURIComponent(id)}`)
}

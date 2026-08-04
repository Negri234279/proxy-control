import { Buffer } from 'node:buffer'
import { Agent, request } from 'node:https'
import { ProviderError } from '../errors'

// Cliente del Mikrotik (RouterOS 7 REST API sobre www-ssl, 443). Usa node:https en vez de
// fetch para poder aceptar el certificado self-signed del router (tlsInsecure). Sin estado:
// recibe la conexión (`MikrotikApi`) por parámetro, resuelta desde el panel/DB.
// Docs: https://help.mikrotik.com/docs/display/ROS/REST+API

export interface MikrotikApi {
    baseUrl: string
    user: string
    password: string
    tlsInsecure: boolean
}

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

// Reutiliza agentes por modo TLS (solo dos posibles) para no crear uno por request.
const agents = new Map<boolean, Agent>()

function agentFor(tlsInsecure: boolean): Agent {
    let agent = agents.get(tlsInsecure)
    if (!agent) {
        agent = new Agent({ rejectUnauthorized: !tlsInsecure })
        agents.set(tlsInsecure, agent)
    }

    return agent
}

function mikrotikRequest<T>(api: MikrotikApi, method: string, path: string, body?: unknown): Promise<T> {
    const base = api.baseUrl.replace(/\/$/, '') + '/rest'
    const auth = 'Basic ' + Buffer.from(`${api.user}:${api.password}`).toString('base64')

    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body)
        const headers: Record<string, string> = {
            Authorization: auth,
            Accept: 'application/json',
        }

        if (payload !== undefined) {
            headers['Content-Type'] = 'application/json'
            headers['Content-Length'] = String(Buffer.byteLength(payload))
        }

        const req = request(
            new URL(base + path),
            {
                method,
                agent: agentFor(api.tlsInsecure),
                headers,
                family: 4,
                timeout: 8000,
            },
            (res) => {
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
            },
        )

        // Sin timeout, un Mikrotik inalcanzable colgaría la carga de la tabla.
        req.on('timeout', () => req.destroy(new Error('timeout tras 8s')))

        req.on('error', (cause) => {
            const code = (cause as NodeJS.ErrnoException)?.code
            const detail = code ?? (cause instanceof Error ? cause.message : 'desconocido')
            
            reject(new ProviderError('mikrotik', `No se pudo contactar con Mikrotik (${detail})`, { cause }))
        })

        if (payload !== undefined) {
            req.write(payload)
        }

        req.end()
    })
}

export function listStaticDns(api: MikrotikApi): Promise<MikrotikDnsEntry[]> {
    return mikrotikRequest<MikrotikDnsEntry[]>(api, 'GET', '/ip/dns/static')
}

export function createStaticDns(api: MikrotikApi, input: CreateStaticDnsInput): Promise<MikrotikDnsEntry> {
    return mikrotikRequest<MikrotikDnsEntry>(api, 'PUT', '/ip/dns/static', {
        name: input.name,
        address: input.address,
        type: 'A',
    })
}

export function updateStaticDns(api: MikrotikApi, id: string, address: string): Promise<MikrotikDnsEntry> {
    return mikrotikRequest<MikrotikDnsEntry>(api, 'PATCH', `/ip/dns/static/${encodeURIComponent(id)}`, { address })
}

export function deleteStaticDns(api: MikrotikApi, id: string): Promise<void> {
    return mikrotikRequest<void>(api, 'DELETE', `/ip/dns/static/${encodeURIComponent(id)}`)
}

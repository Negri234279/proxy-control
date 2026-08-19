import { request, type RequestOptions } from 'node:http'
import { ProviderError } from '../errors'

// Cliente del daemon de Docker (Engine API) para leer containers y sus labels, y para
// escuchar el stream de eventos. Sin lógica de negocio: recibe la conexión (`DockerApi`)
// por parámetro. Usa node:http sobre el socket unix (o un host tcp).
// Docs: https://docs.docker.com/engine/api/

export interface DockerApi {
    // Ruta del socket unix (por defecto /var/run/docker.sock) o host/puerto tcp.
    socketPath?: string
    host?: string
    port?: number
}

// Container tal y como lo devuelve GET /containers/json (subset que usamos).
export interface DockerContainer {
    Id: string
    Names: string[]
    Labels: Record<string, string>
    State: string
    Status: string
}

// Evento del stream GET /events (subset).
export interface DockerEvent {
    Type: string
    Action: string
    Actor: {
        ID: string
        Attributes: Record<string, string>
    }
}

function requestOptions(api: DockerApi, method: string, path: string): RequestOptions {
    if (api.host) {
        return { host: api.host, port: api.port ?? 2375, method, path }
    }

    return { socketPath: api.socketPath ?? '/var/run/docker.sock', method, path }
}

function encodeFilters(filters: Record<string, string[]>): string {
    return `filters=${encodeURIComponent(JSON.stringify(filters))}`
}

function dockerRequest<T>(api: DockerApi, method: string, path: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const req = request({ ...requestOptions(api, method, path), timeout: 8000 }, (res) => {
            const chunks: Buffer[] = []

            res.on('data', (chunk) => chunks.push(chunk as Buffer))
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8')
                const status = res.statusCode ?? 0

                if (status < 200 || status >= 300) {
                    reject(new ProviderError('docker', `Docker respondió ${status}: ${text.slice(0, 300)}`, { status }))
                    return
                }

                if (!text) {
                    resolve(undefined as T)
                    return
                }

                try {
                    resolve(JSON.parse(text) as T)
                } catch (cause) {
                    reject(new ProviderError('docker', 'Respuesta no-JSON de Docker', { cause }))
                }
            })
        })

        // Sin timeout, un daemon inalcanzable colgaría la carga.
        req.on('timeout', () => req.destroy(new Error('timeout tras 8s')))

        req.on('error', (cause) => {
            const code = (cause as NodeJS.ErrnoException)?.code
            const detail = code ?? (cause instanceof Error ? cause.message : 'desconocido')

            reject(new ProviderError('docker', `No se pudo contactar con Docker (${detail})`, { cause }))
        })

        req.end()
    })
}

// Lista los containers en ejecución con el label de gate (p. ej. proxy-control.enable=true).
export function listContainers(api: DockerApi, enableLabel: string): Promise<DockerContainer[]> {
    const query = encodeFilters({ label: [`${enableLabel}=true`] })

    return dockerRequest<DockerContainer[]>(api, 'GET', `/containers/json?${query}`)
}

// Abre el stream de eventos de containers e invoca `onEvent` por cada uno. La promesa se
// resuelve cuando el stream termina y se rechaza en error. Cortar con `signal.abort()`.
export function streamEvents(
    api: DockerApi,
    onEvent: (event: DockerEvent) => void,
    signal: AbortSignal,
): Promise<void> {
    const query = encodeFilters({
        type: ['container'],
        event: ['start', 'stop', 'die', 'destroy', 'update'],
    })

    return new Promise((resolve, reject) => {
        // Stream largo: sin timeout de socket (se cierra por abort o por caída del daemon).
        const req = request(requestOptions(api, 'GET', `/events?${query}`), (res) => {
            const status = res.statusCode ?? 0
            if (status < 200 || status >= 300) {
                reject(new ProviderError('docker', `Docker /events respondió ${status}`, { status }))
                return
            }

            let buffer = ''

            res.setEncoding('utf8')
            res.on('data', (chunk: string) => {
                buffer += chunk
                let index = buffer.indexOf('\n')

                // Cada evento es una línea JSON; procesa las completas y guarda el resto.
                while (index >= 0) {
                    const line = buffer.slice(0, index).trim()
                    buffer = buffer.slice(index + 1)
                    index = buffer.indexOf('\n')

                    if (!line) continue

                    try {
                        onEvent(JSON.parse(line) as DockerEvent)
                    } catch {
                        // Línea parcial/no-JSON: se ignora (el resync de seguridad cubre huecos).
                    }
                }
            })
            res.on('end', () => resolve())
            res.on('error', (cause) => reject(new ProviderError('docker', 'Error en el stream de eventos', { cause })))
        })

        req.on('error', (cause) => {
            if (signal.aborted) {
                resolve()
                return
            }

            reject(new ProviderError('docker', 'No se pudo abrir el stream de eventos de Docker', { cause }))
        })

        signal.addEventListener('abort', () => req.destroy(), { once: true })

        req.end()
    })
}

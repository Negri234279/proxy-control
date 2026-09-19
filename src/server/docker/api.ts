import { env } from '../config/env'
import type { DockerApi } from '../providers/docker'

// Resuelve la(s) conexión(es) al daemon de Docker desde el entorno. Un host es un daemon
// vigilado, con un nombre que etiqueta métricas, estado y la trazabilidad de cada dominio.
export interface DockerHost {
    name: string
    api: DockerApi
}

// Convierte una url (`tcp://host:port`, `unix:///ruta.sock`) o una ruta de socket en la
// conexión del cliente. Lanza si el esquema no es soportado.
function apiFromUrl(url: string): DockerApi {
    if (url.startsWith('tcp://') || url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url)

        return { host: parsed.hostname, port: parsed.port ? Number(parsed.port) : 2375 }
    }

    if (url.startsWith('unix://')) {
        return { socketPath: url.slice('unix://'.length) }
    }

    // Sin esquema: se interpreta como ruta de socket unix.
    if (url.startsWith('/')) {
        return { socketPath: url }
    }

    throw new Error(`Docker host inválido: "${url}" (usa tcp://host:port, unix:///ruta.sock o /ruta.sock)`)
}

// Nombre por defecto de una conexión cuando la entrada no lo especifica.
function defaultName(api: DockerApi): string {
    if (api.host) {
        return `${api.host}:${api.port ?? 2375}`
    }

    return 'local'
}

// Parsea una entrada `nombre=url` o `url` en un host nombrado.
function parseEntry(entry: string): DockerHost {
    const trimmed = entry.trim()
    const separator = trimmed.indexOf('=')

    // Solo cuenta como `nombre=url` si el `=` va antes del esquema (evita partir `tcp://…`).
    const schemeAt = trimmed.indexOf('://')
    const hasName = separator > 0 && (schemeAt < 0 || separator < schemeAt)

    if (hasName) {
        const name = trimmed.slice(0, separator).trim()
        const api = apiFromUrl(trimmed.slice(separator + 1).trim())

        return { name, api }
    }

    const api = apiFromUrl(trimmed)

    return { name: defaultName(api), api }
}

// Asegura nombres únicos (colisiones romperían las labels de métricas): sufija -2, -3, …
function withUniqueNames(hosts: DockerHost[]): DockerHost[] {
    const counts = new Map<string, number>()

    return hosts.map((host) => {
        const seen = counts.get(host.name) ?? 0
        counts.set(host.name, seen + 1)

        return seen === 0 ? host : { ...host, name: `${host.name}-${seen + 1}` }
    })
}

// Lista de daemons a vigilar. DOCKER_HOSTS (multi-host) tiene prioridad; si no, el legacy
// de un host: DOCKER_HOST (tcp://) o el socket unix local (DOCKER_SOCKET_PATH).
export function dockerHostsFromEnv(): DockerHost[] {
    if (env.DOCKER_HOSTS) {
        const hosts = env.DOCKER_HOSTS.split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .map(parseEntry)

        return withUniqueNames(hosts)
    }

    if (env.DOCKER_HOST) {
        const api = apiFromUrl(env.DOCKER_HOST)

        return [{ name: defaultName(api), api }]
    }

    return [{ name: 'local', api: { socketPath: env.DOCKER_SOCKET_PATH } }]
}

// Label de gate: <prefix>.enable. El resto del namespace cuelga de <prefix>.
export function enableLabel(): string {
    return `${env.DOCKER_LABEL_PREFIX}.enable`
}

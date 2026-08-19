import { env } from '../config/env'
import type { DockerApi } from '../providers/docker'

// Resuelve la conexión al daemon de Docker desde el entorno: DOCKER_HOST (tcp://host:port)
// si está definido; si no, el socket unix local (DOCKER_SOCKET_PATH).
export function dockerApiFromEnv(): DockerApi {
    if (env.DOCKER_HOST) {
        const url = new URL(env.DOCKER_HOST)

        return { host: url.hostname, port: url.port ? Number(url.port) : 2375 }
    }

    return { socketPath: env.DOCKER_SOCKET_PATH }
}

// Label de gate: <prefix>.enable. El resto del namespace cuelga de <prefix>.
export function enableLabel(): string {
    return `${env.DOCKER_LABEL_PREFIX}.enable`
}

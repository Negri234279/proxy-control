import { env } from '../../server/config/env'
import { syncFromDocker } from '../../server/docker/sync'
import { ValidationError } from '../../server/errors'
import { json, route } from '../../server/http/error-response'

// Dispara un descubrimiento manual desde las labels de Docker (además del worker en background).
export const POST = route(async () => {
    if (!env.DOCKER_LABELS_ENABLED) {
        throw new ValidationError('El descubrimiento por Docker está deshabilitado', {
            docker: 'activa DOCKER_LABELS_ENABLED',
        })
    }

    const summary = await syncFromDocker()

    return json({ summary })
})

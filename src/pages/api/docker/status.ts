import { getDockerWatcherState } from '../../../server/docker/watcher'
import { json, route } from '../../../server/http/error-response'

// Estado del worker de descubrimiento por Docker (para la UI: conexión, último sync, resumen).
export const GET = route(async () => json({ status: getDockerWatcherState() }))

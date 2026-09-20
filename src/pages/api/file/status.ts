import { getFileWatcherState } from '../../../server/file/watcher'
import { json, route } from '../../../server/http/error-response'

// Estado del worker de descubrimiento por fichero YAML (para la UI: watch, último sync, resumen).
export const GET = route(async () => json({ status: getFileWatcherState() }))

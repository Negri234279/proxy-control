// Tipos compartidos del descubrimiento declarativo (Docker, fichero YAML, …) entre backend
// y front (respuestas de la API).

// Resumen de una pasada de sincronización desde una fuente declarativa.
export interface SyncSummary {
    created: number
    updated: number
    skipped: number
    orphaned: number
    unchanged: number
    errors: { hostname: string; error: string }[]
}

// Estado del worker de descubrimiento por fichero (GET /api/file/status).
export interface FileWatcherState {
    enabled: boolean
    running: boolean
    // `true` si hay al menos un fichero/directorio vigilado con éxito.
    watching: boolean
    path: string
    lastSyncAt: string | null
    lastSummary: SyncSummary | null
    lastError: string | null
}

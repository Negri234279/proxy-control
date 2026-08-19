// Tipos del descubrimiento por Docker compartidos entre backend y front (respuestas de la API).

// Resumen de una pasada de sincronización desde labels de Docker.
export interface DockerSyncSummary {
    created: number
    updated: number
    skipped: number
    orphaned: number
    unchanged: number
    errors: { hostname: string; error: string }[]
}

// Estado del worker de descubrimiento (GET /api/docker/status).
export interface DockerWatcherState {
    enabled: boolean
    running: boolean
    connected: boolean
    lastSyncAt: string | null
    lastSummary: DockerSyncSummary | null
    lastError: string | null
}

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

// Estado de conexión de un daemon de Docker vigilado (multi-host).
export interface DockerHostStatus {
    name: string
    connected: boolean
}

// Estado del worker de descubrimiento (GET /api/docker/status).
export interface DockerWatcherState {
    enabled: boolean
    running: boolean
    // Conexión por host: `true` si el stream de eventos de ese daemon está abierto.
    hosts: DockerHostStatus[]
    lastSyncAt: string | null
    lastSummary: DockerSyncSummary | null
    lastError: string | null
}

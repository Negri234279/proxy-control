// Tipos del descubrimiento por Docker compartidos entre backend y front (respuestas de la API).

import type { SyncSummary } from './discovery'

// Resumen de una pasada de sincronización desde labels de Docker (forma genérica compartida).
export type DockerSyncSummary = SyncSummary

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

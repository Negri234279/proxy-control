// Tipos de dominio compartidos entre el backend (schema/DB, providers) y el front
// (islas Preact). Sin lógica: solo tipos y sus valores por defecto.

export type Visibility = 'public' | 'private' | 'unclassified'
export type ForwardScheme = 'http' | 'https'
export type SslMode = 'new' | 'wildcard'
export type CfRecordType = 'A' | 'CNAME'
export type ReconcileState = 'synced' | 'drift' | 'missing' | 'error'

// Opciones del proxy host de NPM (mapeadas a los campos reales de su API en el provider).
export interface NpmOptions {
    blockExploits: boolean // block_exploits
    websockets: boolean // allow_websocket_upgrade
    cacheAssets: boolean // caching_enabled
    http2: boolean // http2_support
    hsts: boolean // hsts_enabled
    forceSsl: boolean // ssl_forced
}

// Ubicación personalizada dentro de un proxy host (NPM `locations[]`).
export interface CustomLocation {
    path: string
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
}

// Defaults aplicados al crear cualquier dominio (todas las protecciones ON).
export const DEFAULT_NPM_OPTIONS: NpmOptions = {
    blockExploits: true,
    websockets: true,
    cacheAssets: true,
    http2: true,
    hsts: true,
    forceSsl: true,
}

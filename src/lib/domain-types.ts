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
    hstsSubdomains: boolean // hsts_subdomains (incluir subdominios en HSTS)
    forceSsl: boolean // ssl_forced
    trustForwardedProto: boolean // trust_forwarded_proto (confiar en X-Forwarded-Proto)
}

// Ubicación personalizada dentro de un proxy host (NPM `locations[]`).
export interface CustomLocation {
    path: string
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
    advancedConfig: string // config nginx personalizada por ubicación
}

// Defaults aplicados al crear cualquier dominio (todas las protecciones ON).
export const DEFAULT_NPM_OPTIONS: NpmOptions = {
    blockExploits: true,
    websockets: false,
    cacheAssets: false,
    http2: true,
    hsts: true,
    hstsSubdomains: true,
    forceSsl: true,
    trustForwardedProto: false,
}

// ── Formas de vista compartidas front/back (respuestas de la API) ──

// Fila de la tabla: NPM cruzado con la DB (id null = host de NPM sin clasificar).
// `reconcileState` es el agregado (glow de la fila); `npmState`/`dnsState` son el estado
// por proveedor (cada badge usa el suyo). Null en dominios sin clasificar.
export interface DomainListItem {
    id: string | null
    hostname: string
    visibility: Visibility
    forwardScheme: ForwardScheme | null
    forwardHost: string | null
    forwardPort: number | null
    reconcileState: ReconcileState | null
    npmState: ReconcileState | null
    dnsState: ReconcileState | null
    npmProxyId: number | null
    enabledInNpm: boolean
    // Config deseada (para editar). Null en dominios sin clasificar.
    npmOptions: NpmOptions | null
    customLocations: CustomLocation[]
    advancedConfig: string
    certificateId: number | null
    cfRecordType: CfRecordType | null
    cfContent: string | null
    cfProxied: boolean
}

// Snapshot de estado para el polling (chequeo en vivo).
export interface DomainStatusItem {
    id: string
    hostname: string
    visibility: Visibility
    reconcileState: ReconcileState
    npmState: ReconcileState
    dnsState: ReconcileState
    enabledInNpm: boolean
    lastReconciledAt: string | null
}

// Resultado por dominio de "reconciliar todo".
export interface ReconcileResultItem {
    id: string
    hostname: string
    state: ReconcileState
    error?: string
}

// Chequeo por proveedor (diff en vivo).
export interface ProviderCheckView {
    present: boolean
    drift: boolean
    detail?: string
    // Causas del drift, una por entrada (para listarlas en el desplegable).
    reasons?: string[]
}

// Diff en vivo de un dominio (GET /api/domains/:id/status).
export interface DomainDiffView {
    state: ReconcileState
    npm: ProviderCheckView
    dns: ProviderCheckView
    enabledInNpm: boolean
    issues: string[]
}

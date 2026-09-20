import { watch, type FSWatcher } from 'node:fs'
import type { FileWatcherState, SyncSummary } from '../../lib/discovery'
import { env } from '../config/env'
import { logger } from '../observability/logger'
import { syncFromFile } from './sync'

// Worker singleton del descubrimiento por fichero YAML (mismo patrón que Docker: watch +
// reconcile). fs.watch sobre FILE_DOMAINS_PATH (fichero o directorio) reacciona a cambios con
// debounce; un resync periódico es la red de seguridad ante eventos perdidos o si la ruta aún
// no existía al arrancar (se reintenta enganchar el watch en cada resync).
//
// Arranque idempotente desde el middleware (primer request), igual que el watcher de Docker.

const state = {
    enabled: env.FILE_DOMAINS_ENABLED,
    running: false,
    watching: false,
    path: env.FILE_DOMAINS_PATH,
    lastSyncAt: null as string | null,
    lastSummary: null as SyncSummary | null,
    lastError: null as string | null,
}

let started = false
let watcher: FSWatcher | null = null
let resyncTimer: ReturnType<typeof setInterval> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let syncing: Promise<void> | null = null

// Coalescing: si ya hay un sync en curso, no se apila otro.
function runSync(reason: string): Promise<void> {
    if (syncing) {
        return syncing
    }

    syncing = (async () => {
        try {
            const summary = await syncFromFile()
            state.lastSummary = summary
            state.lastSyncAt = new Date().toISOString()
            state.lastError = null
        } catch (error) {
            state.lastError = error instanceof Error ? error.message : String(error)
            logger.error('file sync failed', { reason, error: state.lastError })
        } finally {
            syncing = null
        }
    })()

    return syncing
}

// Agrupa una ráfaga de cambios (p. ej. reescribir varios ficheros) en un único sync.
function scheduleDebounced(): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => void runSync('change'), env.FILE_EVENT_DEBOUNCE_MS)
}

// Engancha fs.watch a la ruta. Best-effort: si no existe aún, deja `watching=false` y lo
// reintenta el resync. `watch` sobre un directorio notifica altas/bajas/cambios de sus ficheros.
function attachWatch(): void {
    if (watcher) {
        return
    }

    try {
        watcher = watch(env.FILE_DOMAINS_PATH, { persistent: false }, () => scheduleDebounced())
        watcher.on('error', (error) => {
            logger.warn('file watch error, will retry on resync', { error: error.message })
            watcher?.close()
            watcher = null
            state.watching = false
        })
        state.watching = true
    } catch (error) {
        state.watching = false
        logger.warn('file watch could not attach (path missing?), relying on resync', {
            path: env.FILE_DOMAINS_PATH,
            error: error instanceof Error ? error.message : String(error),
        })
    }
}

export function ensureFileWatcher(): void {
    if (!env.FILE_DOMAINS_ENABLED || started) {
        return
    }

    started = true
    state.running = true

    logger.info('file watcher starting', {
        path: env.FILE_DOMAINS_PATH,
        resyncIntervalMs: env.FILE_RESYNC_INTERVAL_MS,
    })

    void runSync('initial')
    attachWatch()
    resyncTimer = setInterval(() => {
        attachWatch()
        void runSync('resync')
    }, env.FILE_RESYNC_INTERVAL_MS)

    process.once('SIGTERM', stopFileWatcher)
    process.once('SIGINT', stopFileWatcher)
}

export function stopFileWatcher(): void {
    if (!started) {
        return
    }

    started = false
    state.running = false
    state.watching = false

    watcher?.close()
    watcher = null

    if (resyncTimer) {
        clearInterval(resyncTimer)
        resyncTimer = null
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
}

export function getFileWatcherState(): FileWatcherState {
    return { ...state }
}

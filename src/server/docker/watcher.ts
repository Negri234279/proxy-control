import type { DockerHostStatus, DockerWatcherState } from '../../lib/docker'
import { env } from '../config/env'
import { logger } from '../observability/logger'
import { streamEvents } from '../providers/docker'
import { dockerHostsFromEnv, type DockerHost } from './api'
import { syncFromDocker } from './sync'

// Worker singleton del descubrimiento por Docker (patrón "watch + reconcile"):
//   1) scan inicial   → estado base
//   2) stream de eventos (debounced) → reacciona en ~ms
//   3) resync periódico → red de seguridad ante eventos perdidos
//   4) reconexión con backoff si el stream cae (+ resync al reconectar)
//
// Multi-host: se abre un stream de eventos POR daemon (cada uno con su backoff), pero el
// sync es COMPARTIDO — cualquier evento de cualquier host dispara un único sync global (el
// sync lee todos los hosts). La conexión se sigue por host para el estado/métricas.
//
// Nota: @astrojs/node standalone no expone un hook de "server start" para código de la app,
// así que se arranca de forma idempotente desde el middleware (primer request). El container
// one-shot de migraciones nunca lo toca (no levanta el server). Una sola instancia por proceso.

const state = {
    enabled: env.DOCKER_LABELS_ENABLED,
    running: false,
    lastSyncAt: null as string | null,
    lastSummary: null as DockerWatcherState['lastSummary'],
    lastError: null as string | null,
}

// Conexión por host (nombre → conectado). Se rellena al arrancar.
const hostConnected = new Map<string, boolean>()

let started = false
let abort: AbortController | null = null
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
            const summary = await syncFromDocker()
            state.lastSummary = summary
            state.lastSyncAt = new Date().toISOString()
            state.lastError = null
        } catch (error) {
            state.lastError = error instanceof Error ? error.message : String(error)
            logger.error('docker sync failed', { reason, error: state.lastError })
        } finally {
            syncing = null
        }
    })()

    return syncing
}

// Agrupa una ráfaga de eventos (p. ej. un `docker compose up`) en un único sync.
function scheduleDebounced(): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => void runSync('event'), env.DOCKER_EVENT_DEBOUNCE_MS)
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener(
            'abort',
            () => {
                clearTimeout(timer)
                resolve()
            },
            { once: true },
        )
    })
}

// Stream de eventos de UN host, con reconexión y backoff propios. No dispara resync inicial
// (lo cubre el scan inicial global); sí resync al reconectar tras una caída de ese host.
async function watchHost(host: DockerHost, signal: AbortSignal): Promise<void> {
    let backoff = 1000
    let first = true

    while (!signal.aborted) {
        if (!first) {
            void runSync(`reconnect:${host.name}`)
        }
        first = false

        try {
            hostConnected.set(host.name, true)
            await streamEvents(host.api, scheduleDebounced, signal)
            hostConnected.set(host.name, false)
            backoff = 1000
        } catch (error) {
            hostConnected.set(host.name, false)
            if (!signal.aborted) {
                logger.warn('docker events stream lost, reconnecting', {
                    host: host.name,
                    error: error instanceof Error ? error.message : String(error),
                    backoffMs: backoff,
                })
            }
        }

        if (signal.aborted) {
            break
        }

        await delay(backoff, signal)
        backoff = Math.min(backoff * 2, 30_000)
    }
}

// Arranque idempotente. No hace nada si el descubrimiento está deshabilitado.
export function ensureDockerWatcher(): void {
    if (!env.DOCKER_LABELS_ENABLED || started) {
        return
    }

    const hosts = dockerHostsFromEnv()

    started = true
    state.running = true
    abort = new AbortController()

    hostConnected.clear()
    for (const host of hosts) {
        hostConnected.set(host.name, false)
    }

    logger.info('docker watcher starting', {
        hosts: hosts.map((host) => host.name),
        resyncIntervalMs: env.DOCKER_RESYNC_INTERVAL_MS,
        labelPrefix: env.DOCKER_LABEL_PREFIX,
    })

    void runSync('initial')
    for (const host of hosts) {
        void watchHost(host, abort.signal)
    }
    resyncTimer = setInterval(() => void runSync('resync'), env.DOCKER_RESYNC_INTERVAL_MS)

    process.once('SIGTERM', stopDockerWatcher)
    process.once('SIGINT', stopDockerWatcher)
}

export function stopDockerWatcher(): void {
    if (!started) {
        return
    }

    started = false
    state.running = false
    hostConnected.clear()

    abort?.abort()
    abort = null

    if (resyncTimer) {
        clearInterval(resyncTimer)
        resyncTimer = null
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
}

export function getDockerWatcherState(): DockerWatcherState {
    const hosts: DockerHostStatus[] = [...hostConnected].map(([name, connected]) => ({ name, connected }))

    return { ...state, hosts }
}

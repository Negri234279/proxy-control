import { useNow } from '../hooks/useNow'
import { Spinner } from './Spinner'

interface Props {
    lastUpdatedAt: number | null
    pollingFailed: boolean
    fleetRunning: boolean
    authEnabled: boolean
    onReconcileAll: () => void
    onAdd: () => void
}

function relativeAge(from: number, now: number): string {
    const seconds = Math.max(0, Math.round((now - from) / 1000))
    if (seconds < 60) {
        return `hace ${seconds}s`
    }

    return `hace ${Math.round(seconds / 60)} min`
}

function PollingIndicator({ lastUpdatedAt, failed }: { lastUpdatedAt: number | null; failed: boolean }) {
    const now = useNow(5000)
    const stale = failed || (lastUpdatedAt !== null && now - lastUpdatedAt > 45_000)
    const color = stale ? 'var(--color-drift)' : 'var(--color-synced)'
    const label = failed
        ? 'sin actualizar'
        : lastUpdatedAt === null
          ? 'esperando…'
          : `actualizado ${relativeAge(lastUpdatedAt, now)}`

    return (
        <span
            class="inline-flex items-center gap-2 text-xs text-[var(--color-muted)]"
            aria-live="polite"
            aria-label={`Estados ${label}`}
        >
            <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
            {label}
        </span>
    )
}

export function AppHeader(props: Props) {
    return (
        <header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 class="text-xl font-semibold tracking-tight">proxy-control</h1>
                <p class="text-sm text-[var(--color-muted)]">Nginx Proxy Manager × reconciliación DNS</p>
            </div>
            <div class="flex items-center gap-3">
                <PollingIndicator lastUpdatedAt={props.lastUpdatedAt} failed={props.pollingFailed} />
                <button
                    type="button"
                    onClick={props.onReconcileAll}
                    disabled={props.fleetRunning}
                    class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    style={{ backgroundColor: 'var(--color-accent)' }}
                >
                    {props.fleetRunning ? <Spinner size={14} /> : null}
                    {props.fleetRunning ? 'Reconciliando…' : 'Reconciliar todo'}
                </button>
                <button
                    type="button"
                    onClick={props.onAdd}
                    class="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-surface-2)]"
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    + Añadir dominio
                </button>
                {props.authEnabled ? (
                    <form method="post" action="/api/auth/logout">
                        <button
                            type="submit"
                            class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            Salir
                        </button>
                    </form>
                ) : null}
            </div>
        </header>
    )
}

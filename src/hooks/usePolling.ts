import { useEffect, useRef, useState } from 'preact/hooks'
import { api } from '../lib/api'
import type { DomainStatusItem } from '../lib/domain-types'

const INTERVAL_MS = 15_000

// Polling de solo lectura del estado (GET /api/status). Pausa con la pestaña oculta y
// cuando `enabled` es false (p. ej. durante "reconciliar todo"). Alimenta el indicador
// de frescura y empuja el snapshot a `useDomains`.
export function usePolling(onSnapshot: (snapshot: DomainStatusItem[]) => void, enabled: boolean) {
    const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
    const [failed, setFailed] = useState(false)
    const onSnapshotRef = useRef(onSnapshot)
    onSnapshotRef.current = onSnapshot

    useEffect(() => {
        if (!enabled) {
            return
        }

        let cancelled = false

        const tick = async () => {
            if (document.hidden) {
                return
            }
            try {
                const snapshot = await api.status()
                if (cancelled) {
                    return
                }
                onSnapshotRef.current(snapshot)
                setLastUpdatedAt(Date.now())
                setFailed(false)
            } catch {
                if (!cancelled) {
                    setFailed(true)
                }
            }
        }

        const timer = setInterval(tick, INTERVAL_MS)
        const onVisibility = () => {
            if (!document.hidden) {
                void tick()
            }
        }
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            cancelled = true
            clearInterval(timer)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [enabled])

    return { lastUpdatedAt, failed }
}

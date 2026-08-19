import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import type { ToastKind } from './useToasts'

interface DiscoverDeps {
    refetch: () => Promise<void>
    pushToast: (kind: ToastKind, message: string) => void
}

// `1 nuevo` / `2 nuevos` — singular/plural según el conteo.
function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`
}

// Descubrimiento manual desde labels de Docker (además del worker en background).
export function useDiscover({ refetch, pushToast }: DiscoverDeps) {
    const [running, setRunning] = useState(false)

    const discover = useCallback(async () => {
        setRunning(true)

        try {
            const summary = await api.discover()
            await refetch()

            if (summary.errors.length > 0) {
                // Los errores llevan el hostname que falló (dato accionable); toast persistente.
                const failed = summary.errors.map((item) => item.hostname).join(', ')
                pushToast(
                    'error',
                    `Docker: ${plural(summary.errors.length, 'container falló', 'containers fallaron')} — ${failed}`,
                )
                return
            }

            const changed = summary.created + summary.updated + summary.orphaned
            if (changed === 0) {
                pushToast('info', 'Docker: sin cambios')
                return
            }

            const parts = [
                plural(summary.created, 'nuevo', 'nuevos'),
                plural(summary.updated, 'actualizado', 'actualizados'),
                plural(summary.orphaned, 'huérfano', 'huérfanos'),
            ]
            pushToast('success', `Docker: ${parts.join(', ')}`)
        } catch (error) {
            pushToast('error', `Descubrir desde Docker falló: ${(error as ApiError).message}`)
        } finally {
            setRunning(false)
        }
    }, [pushToast, refetch])

    return { running, discover }
}

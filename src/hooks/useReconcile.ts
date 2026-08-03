import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import type { DomainListItem } from '../lib/domain-types'
import type { ToastKind } from './useToasts'

interface ReconcileDeps {
    patchRow: (id: string, patch: Partial<DomainListItem>) => void
    refetch: () => Promise<void>
    pushToast: (kind: ToastKind, message: string) => void
    setPollingEnabled: (enabled: boolean) => void
}

// Reconciliación BAJO DEMANDA: por fila y de toda la flota. `reconcilingIds` marca las
// filas en estado "checking".
export function useReconcile({ patchRow, refetch, pushToast, setPollingEnabled }: ReconcileDeps) {
    const [reconcilingIds, setReconcilingIds] = useState<Set<string>>(new Set())
    const [fleetRunning, setFleetRunning] = useState(false)

    const mark = useCallback((id: string, on: boolean) => {
        setReconcilingIds((prev) => {
            const next = new Set(prev)

            on ? next.add(id) : next.delete(id)

            return next
        })
    }, [])

    const reconcileOne = useCallback(
        async (id: string, hostname: string) => {
            mark(id, true)

            try {
                const domain = await api.reconcileOne(id)
                // Optimista: tras reconciliar ambos proveedores quedan en el mismo estado;
                // el siguiente poll en vivo lo afina.
                patchRow(id, {
                    reconcileState: domain.reconcileState,
                    npmState: domain.reconcileState,
                    dnsState: domain.reconcileState,
                })

                domain.reconcileState === 'synced'
                    ? pushToast('success', `${hostname} sincronizado`)
                    : pushToast('info', `${hostname}: ${domain.reconcileState}`)
            } catch (error) {
                patchRow(id, { reconcileState: 'error', npmState: 'error', dnsState: 'error' })
                pushToast('error', `Reconciliar falló: ${hostname} — ${(error as ApiError).message}`)
            } finally {
                mark(id, false)
            }
        },
        [mark, patchRow, pushToast],
    )

    const reconcileAll = useCallback(async () => {
        setFleetRunning(true)
        setPollingEnabled(false)

        try {
            const results = await api.reconcileAll()
            const synced = results.filter((result) => result.state === 'synced').length
            const failed = results.filter((result) => result.state === 'error').length

            await refetch()

            pushToast(failed > 0 ? 'error' : 'success', `Reconciliar todo: ${synced} OK, ${failed} con error`)
        } catch (error) {
            pushToast('error', `Reconciliar todo falló: ${(error as ApiError).message}`)
        } finally {
            setFleetRunning(false)
            setPollingEnabled(true)
        }
    }, [pushToast, refetch, setPollingEnabled])

    return {
        reconcilingIds,
        fleetRunning,
        reconcileOne,
        reconcileAll,
    }
}

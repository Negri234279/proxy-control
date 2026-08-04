import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import type { DomainListItem } from '../lib/domain-types'
import type { ToastKind } from './useToasts'

interface ToggleDeps {
    patchByNpmId: (npmProxyId: number, patch: Partial<DomainListItem>) => void
    pushToast: (kind: ToastKind, message: string) => void
}

// Habilita/deshabilita el proxy host en NPM (mismo botón que la UI de NPM), con
// confirmación previa (deshabilitar deja el servicio inaccesible). Optimista: actualiza la
// fila al instante y revierte si la API falla. `togglingIds` marca los que están en vuelo
// (por id de proxy host) para bloquear el control mientras tanto.
export function useToggleEnabled({ patchByNpmId, pushToast }: ToggleDeps) {
    const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set())
    const [pending, setPending] = useState<DomainListItem | null>(null)
    const [submitting, setSubmitting] = useState(false)

    const mark = useCallback((id: number, on: boolean) => {
        setTogglingIds((prev) => {
            const next = new Set(prev)

            on ? next.add(id) : next.delete(id)

            return next
        })
    }, [])

    const toggle = useCallback(
        async (npmProxyId: number, hostname: string, enabled: boolean) => {
            mark(npmProxyId, true)
            patchByNpmId(npmProxyId, { enabledInNpm: enabled })

            try {
                await api.setEnabled(npmProxyId, enabled)
                pushToast('success', `${hostname} ${enabled ? 'habilitado' : 'deshabilitado'}`)
            } catch (error) {
                patchByNpmId(npmProxyId, { enabledInNpm: !enabled })
                pushToast(
                    'error',
                    `No se pudo ${enabled ? 'habilitar' : 'deshabilitar'} ${hostname}: ${(error as ApiError).message}`,
                )
            } finally {
                mark(npmProxyId, false)
            }
        },
        [mark, patchByNpmId, pushToast],
    )

    // Abre la confirmación para la fila; el destino se deriva de su estado al confirmar.
    const request = useCallback((row: DomainListItem) => {
        setPending(row)
    }, [])

    const close = useCallback(() => {
        setPending(null)
    }, [])

    const confirm = useCallback(async () => {
        const row = pending

        if (!row?.npmProxyId) {
            return
        }

        setSubmitting(true)

        try {
            await toggle(row.npmProxyId, row.hostname, !row.enabledInNpm)
            setPending(null)
        } finally {
            setSubmitting(false)
        }
    }, [pending, toggle])

    return {
        togglingIds,
        pending,
        submitting,
        request,
        confirm,
        close,
    }
}

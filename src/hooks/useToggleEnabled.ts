import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import type { DomainListItem } from '../lib/domain-types'
import type { ToastKind } from './useToasts'

interface ToggleDeps {
    patchByNpmId: (npmProxyId: number, patch: Partial<DomainListItem>) => void
    pushToast: (kind: ToastKind, message: string) => void
}

// Habilita/deshabilita el proxy host en NPM (mismo botón que la UI de NPM). Optimista:
// actualiza la fila al instante y revierte si la API falla. `togglingIds` marca los que
// están en vuelo (por id de proxy host) para bloquear el control mientras tanto.
export function useToggleEnabled({ patchByNpmId, pushToast }: ToggleDeps) {
    const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set())

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

    return {
        togglingIds,
        toggle,
    }
}

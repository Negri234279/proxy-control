import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import type { DomainListItem } from '../lib/domain-types'
import type { ToastKind } from './useToasts'

interface DeleteDeps {
    refetch: () => Promise<void>
    pushToast: (kind: ToastKind, message: string) => void
}

// Flujo de borrado con confirmación. `removeDns` por defecto OFF (borrar metadata sin
// tocar el registro DNS), para no tumbar un servicio por accidente.
export function useDeleteDomain({ refetch, pushToast }: DeleteDeps) {
    const [pending, setPending] = useState<DomainListItem | null>(null)
    const [removeDns, setRemoveDns] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const open = useCallback((row: DomainListItem) => {
        setPending(row)
        setRemoveDns(false)
    }, [])

    const close = useCallback(() => {
        setPending(null)
    }, [])

    const confirm = useCallback(async () => {
        if (!pending?.id) {
            return
        }
        setSubmitting(true)
        try {
            await api.deleteDomain(pending.id, removeDns)
            pushToast('success', `${pending.hostname} eliminado`)
            setPending(null)
            await refetch()
        } catch (error) {
            pushToast('error', `Eliminar falló: ${(error as ApiError).message}`)
        } finally {
            setSubmitting(false)
        }
    }, [pending, removeDns, pushToast, refetch])

    return { pending, removeDns, setRemoveDns, submitting, open, close, confirm }
}

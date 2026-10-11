import { useCallback, useState } from 'preact/hooks'
import { api } from '../lib/api'
import type { EdgeRuleView } from '../lib/domain-types'

// Estado del flujo de borrado de una regla de borde: qué regla está pendiente de confirmar, si
// está en curso y el posible error. Mantiene el componente declarativo (lógica fuera del JSX).
export function useEdgeRuleDelete(domainId: string, onDeleted: () => void | Promise<void>) {
    const [pending, setPending] = useState<EdgeRuleView | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const request = useCallback((rule: EdgeRuleView) => {
        setError(null)
        setPending(rule)
    }, [])

    const cancel = useCallback(() => {
        if (submitting) {
            return
        }

        setPending(null)
        setError(null)
    }, [submitting])

    const confirm = useCallback(async () => {
        if (!pending) {
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            await api.deleteEdgeRule(domainId, pending.id)
            setPending(null)
            await onDeleted()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo eliminar la regla')
        } finally {
            setSubmitting(false)
        }
    }, [domainId, pending, onDeleted])

    return {
        pending,
        submitting,
        error,
        request,
        cancel,
        confirm,
    }
}

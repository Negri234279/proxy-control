import { useCallback, useState } from 'preact/hooks'
import { api } from '../lib/api'
import type { DomainDiffView } from '../lib/domain-types'

// Diff EN VIVO por fila (GET /api/domains/:id/status) para el detalle expandible con
// `issues[]`. Separado del polling barato: solo se dispara al expandir una fila.
export function useDomainStatus() {
    const [openId, setOpenId] = useState<string | null>(null)
    const [detailById, setDetailById] = useState<Record<string, DomainDiffView>>({})
    const [loadingId, setLoadingId] = useState<string | null>(null)

    const toggle = useCallback(
        async (id: string) => {
            if (openId === id) {
                setOpenId(null)
                return
            }
            setOpenId(id)
            if (detailById[id]) {
                return
            }
            setLoadingId(id)
            try {
                const status = await api.domainStatus(id)
                setDetailById((prev) => ({ ...prev, [id]: status }))
            } catch {
                // El detalle es opcional; si falla, la fila sigue mostrando su estado.
            } finally {
                setLoadingId(null)
            }
        },
        [openId, detailById],
    )

    return { openId, detailById, loadingId, toggle }
}

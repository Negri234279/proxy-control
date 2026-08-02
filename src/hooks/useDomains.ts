import { useCallback, useEffect, useState } from 'preact/hooks'
import { api } from '../lib/api'
import type { DomainListItem, DomainStatusItem, ReconcileState } from '../lib/domain-types'

export type LoadStatus = 'loading' | 'ready' | 'error'

// Fuente de verdad de la tabla: lista + ciclo de fetch. Otros hooks la actualizan con
// `patchRow`/`applyStatusSnapshot`/`refetch` sin acoplarse a la red.
export function useDomains() {
    const [status, setStatus] = useState<LoadStatus>('loading')
    const [domains, setDomains] = useState<DomainListItem[]>([])

    const refetch = useCallback(async () => {
        setStatus('loading')
        try {
            setDomains(await api.listDomains())
            setStatus('ready')
        } catch {
            setStatus('error')
        }
    }, [])

    useEffect(() => {
        void refetch()
    }, [refetch])

    // Polling: parchea solo el estado de los que ya están en la tabla.
    const applyStatusSnapshot = useCallback((snapshot: DomainStatusItem[]) => {
        const byId = new Map<string, ReconcileState>(snapshot.map((item) => [item.id, item.reconcileState]))
        setDomains((prev) =>
            prev.map((domain) =>
                domain.id && byId.has(domain.id) ? { ...domain, reconcileState: byId.get(domain.id) ?? null } : domain,
            ),
        )
    }, [])

    const patchRow = useCallback((id: string, patch: Partial<DomainListItem>) => {
        setDomains((prev) => prev.map((domain) => (domain.id === id ? { ...domain, ...patch } : domain)))
    }, [])

    return { status, domains, refetch, applyStatusSnapshot, patchRow }
}

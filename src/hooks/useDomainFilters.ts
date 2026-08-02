import { useMemo, useState } from 'preact/hooks'
import type { DomainListItem, ReconcileState, Visibility } from '../lib/domain-types'

export type VisibilityFilter = Visibility | 'all'
export type StateFilter = ReconcileState | 'unclassified' | 'all'

// Estado de UI local (sin red): búsqueda + filtros. Devuelve la vista derivada.
export function useDomainFilters(domains: DomainListItem[]) {
    const [query, setQuery] = useState('')
    const [visibility, setVisibility] = useState<VisibilityFilter>('all')
    const [state, setState] = useState<StateFilter>('all')

    const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return domains.filter((domain) => {
            if (visibility !== 'all' && domain.visibility !== visibility) {
                return false
            }
            if (state !== 'all') {
                const rowState = domain.reconcileState ?? 'unclassified'
                if (rowState !== state) {
                    return false
                }
            }
            if (!needle) {
                return true
            }
            const haystack = `${domain.hostname} ${domain.forwardHost ?? ''}`.toLowerCase()
            return haystack.includes(needle)
        })
    }, [domains, query, visibility, state])

    return {
        query,
        setQuery,
        visibility,
        setVisibility,
        state,
        setState,
        filtered,
    }
}

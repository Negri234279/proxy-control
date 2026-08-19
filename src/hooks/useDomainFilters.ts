import { useMemo, useState } from 'preact/hooks'
import type { DomainListItem, ReconcileState, Visibility } from '../lib/domain-types'

export type VisibilityFilter = Visibility | 'all'
export type StateFilter = ReconcileState | 'unclassified' | 'all'
export type SourceFilter = 'all' | 'manual' | 'docker' | 'orphaned'

// Estado de UI local (sin red): búsqueda + filtros. Devuelve la vista derivada.
export function useDomainFilters(domains: DomainListItem[]) {
    const [query, setQuery] = useState('')
    const [visibility, setVisibility] = useState<VisibilityFilter>('all')
    const [state, setState] = useState<StateFilter>('all')
    const [source, setSource] = useState<SourceFilter>('all')

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
            if (source === 'orphaned' && !domain.orphaned) {
                return false
            }
            if ((source === 'manual' || source === 'docker') && domain.source !== source) {
                return false
            }
            if (!needle) {
                return true
            }
            const haystack = `${domain.hostname} ${domain.forwardHost ?? ''}`.toLowerCase()
            return haystack.includes(needle)
        })
    }, [domains, query, visibility, state, source])

    return {
        query,
        setQuery,
        visibility,
        setVisibility,
        state,
        setState,
        source,
        setSource,
        filtered,
    }
}

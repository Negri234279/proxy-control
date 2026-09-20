import { useCallback, useMemo, useState } from 'preact/hooks'
import type { DomainListItem, ReconcileState, Visibility } from '../lib/domain-types'

export type VisibilityFilter = Visibility | 'all'
export type StateFilter = ReconcileState | 'unclassified' | 'all'
export type SourceFilter = 'all' | 'manual' | 'docker' | 'file' | 'orphaned'

// Estado de UI local (sin red): búsqueda + filtros. Devuelve la vista derivada.
export function useDomainFilters(domains: DomainListItem[]) {
    const [query, setQuery] = useState('')
    const [visibility, setVisibility] = useState<VisibilityFilter>('all')
    const [state, setState] = useState<StateFilter>('all')
    const [source, setSource] = useState<SourceFilter>('all')
    // Filtro por host de Docker (multi-host). Vacío = todos los hosts.
    const [hosts, setHosts] = useState<string[]>([])

    // Hosts presentes en los datos (dinámico): valores distintos de dockerHost, ordenados.
    const hostOptions = useMemo(() => {
        const set = new Set<string>()
        for (const domain of domains) {
            if (domain.dockerHost) {
                set.add(domain.dockerHost)
            }
        }
        return [...set].sort((a, b) => a.localeCompare(b))
    }, [domains])

    const toggleHost = useCallback((name: string) => {
        setHosts((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
    }, [])

    const clearHosts = useCallback(() => setHosts([]), [])

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
            if ((source === 'manual' || source === 'docker' || source === 'file') && domain.source !== source) {
                return false
            }
            // Con hosts seleccionados, solo dominios de esos hosts (implica origen docker).
            if (hosts.length > 0 && !(domain.dockerHost && hosts.includes(domain.dockerHost))) {
                return false
            }
            if (!needle) {
                return true
            }
            const haystack = `${domain.hostname} ${domain.forwardHost ?? ''}`.toLowerCase()
            return haystack.includes(needle)
        })
    }, [domains, query, visibility, state, source, hosts])

    return {
        query,
        setQuery,
        visibility,
        setVisibility,
        state,
        setState,
        source,
        setSource,
        hosts,
        hostOptions,
        toggleHost,
        clearHosts,
        filtered,
    }
}

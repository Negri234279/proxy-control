import { useCallback, useState } from 'preact/hooks'
import { api } from '../lib/api'
import type { DomainDetailResponse } from '../lib/domain-types'

// Estado de la página de detalle: arranca con los datos del SSR y los refresca EN SITIO
// (GET /api/domains/:id) tras cada mutación, sin recargar ni navegar. `refreshing` permite
// atenuar la vista mientras llegan los datos nuevos.
export function useDomainDetail(initial: DomainDetailResponse) {
    const [data, setData] = useState<DomainDetailResponse>(initial)
    const [refreshing, setRefreshing] = useState(false)

    const refetch = useCallback(async () => {
        setRefreshing(true)
        try {
            setData(await api.domainDetail(initial.domain.id))
        } finally {
            setRefreshing(false)
        }
    }, [initial.domain.id])

    return {
        data,
        refreshing,
        refetch,
    }
}

import { useCallback, useMemo, useState } from 'preact/hooks'
import type { DomainListItem, ReconcileState } from '../lib/domain-types'

export type SortKey = 'hostname' | 'upstream' | 'visibility' | 'npm' | 'dns' | 'active'
export type SortDir = 'asc' | 'desc'

// Orden semántico para columnas no alfabéticas (rank menor = primero en ascendente).
const VISIBILITY_RANK: Record<string, number> = { public: 0, private: 1, unclassified: 2 }
const STATE_RANK: Record<ReconcileState, number> = { synced: 0, drift: 1, missing: 2, error: 3 }

// Rank de un estado por proveedor: null/sin clasificar al final (después de 'error').
function stateRank(state: ReconcileState | null): number {
    return state ? STATE_RANK[state] : 4
}

function upstreamKey(row: DomainListItem): string {
    return `${row.forwardHost ?? ''}:${String(row.forwardPort ?? 0).padStart(6, '0')}`
}

// Compara dos filas por la clave activa. Devuelve <0, 0 o >0 (orden ascendente base).
function compare(a: DomainListItem, b: DomainListItem, key: SortKey): number {
    if (key === 'upstream') {
        return upstreamKey(a).localeCompare(upstreamKey(b))
    }
    if (key === 'visibility') {
        return (VISIBILITY_RANK[a.visibility] ?? 9) - (VISIBILITY_RANK[b.visibility] ?? 9)
    }
    if (key === 'npm') {
        return stateRank(a.npmState) - stateRank(b.npmState)
    }
    if (key === 'dns') {
        return stateRank(a.dnsState) - stateRank(b.dnsState)
    }
    if (key === 'active') {
        return Number(a.enabledInNpm) - Number(b.enabledInNpm)
    }
    return a.hostname.localeCompare(b.hostname)
}

// Ordenación de la tabla (por defecto hostname ascendente). Click en una columna alterna
// asc/desc; al cambiar de columna arranca en asc. Empate → desempata por hostname (estable).
export function useDomainSort(rows: DomainListItem[]) {
    const [sortKey, setSortKey] = useState<SortKey>('hostname')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    const toggleSort = useCallback(
        (key: SortKey) => {
            if (key === sortKey) {
                setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
                return
            }
            setSortKey(key)
            setSortDir('asc')
        },
        [sortKey],
    )

    const sorted = useMemo(() => {
        const factor = sortDir === 'asc' ? 1 : -1
        return [...rows].sort((a, b) => {
            const primary = compare(a, b, sortKey)
            if (primary !== 0) {
                return primary * factor
            }
            // Desempate estable por hostname (mismo sentido que el orden activo).
            return a.hostname.localeCompare(b.hostname) * factor
        })
    }, [rows, sortKey, sortDir])

    return {
        sortKey,
        sortDir,
        toggleSort,
        sorted,
    }
}

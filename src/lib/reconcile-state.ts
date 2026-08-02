import type { ReconcileState, Visibility } from './domain-types'

// Metadata de PRESENTACIÓN del estado de reconciliación (sin lógica). El color es una
// referencia a variable CSS: se aplica por `style` inline para no depender del scanner
// de Tailwind con clases dinámicas.

export type RowState = ReconcileState | 'checking' | 'unclassified'

export interface StateMeta {
    label: string
    glyph: string
    color: string
}

const STATE_META: Record<RowState, StateMeta> = {
    synced: { label: 'OK', glyph: '●', color: 'var(--color-synced)' },
    drift: { label: 'Drift', glyph: '▲', color: 'var(--color-drift)' },
    missing: { label: 'Falta', glyph: '✕', color: 'var(--color-missing)' },
    error: { label: 'Error', glyph: '⚠', color: 'var(--color-error)' },
    checking: { label: 'Comprobando', glyph: '◍', color: 'var(--color-checking)' },
    unclassified: { label: 'Sin clasificar', glyph: '┄', color: 'var(--color-neutral)' },
}

export function stateMeta(state: RowState | null | undefined): StateMeta {
    if (!state) {
        return STATE_META.unclassified
    }
    return STATE_META[state] ?? STATE_META.unclassified
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
    public: 'Público',
    private: 'Privado',
    unclassified: 'Sin clasificar',
}

// Proveedor de DNS asociado a la visibilidad (para el badge DNS).
export function dnsProviderLabel(visibility: Visibility): string | null {
    if (visibility === 'public') {
        return 'Cloudflare'
    }
    if (visibility === 'private') {
        return 'Mikrotik'
    }
    return null
}

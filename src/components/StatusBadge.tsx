import { stateMeta, type RowState } from '../lib/reconcile-state'

interface Props {
    state: RowState | null | undefined
    provider?: string | null
}

// Badge de estado: glifo + texto (nunca solo color) + proveedor opcional. El color va
// por `style` inline (variable CSS) para no romper el purge de Tailwind.
export function StatusBadge({ state, provider }: Props) {
    const meta = stateMeta(state)
    const pulsing = state === 'checking'

    return (
        <span
            class={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${pulsing ? 'pc-pulse' : ''}`}
            style={{ color: meta.color, backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)' }}
        >
            <span aria-hidden="true">{meta.glyph}</span>
            <span>
                {meta.label}
                {provider ? ` · ${provider}` : ''}
            </span>
        </span>
    )
}

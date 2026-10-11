import { stateMeta } from '../lib/reconcile-state'

interface Props {
    // Texto accesible que explica por qué está huérfano (contexto: dominio vs regla de borde).
    title: string
    label?: string
}

// Pill "huérfano": una declaración que desapareció y NO se borró automáticamente. Usa el color
// de estado 'missing' y nunca depende solo del color (lleva label + title accesible).
export function OrphanPill({ title, label = 'huérfano' }: Props) {
    return (
        <span
            class="inline-block rounded-full border px-1.5 py-0.5 text-[11px] tracking-wide uppercase"
            style={{ borderColor: stateMeta('missing').color, color: stateMeta('missing').color }}
            aria-label={title}
            title={title}
        >
            {label}
        </span>
    )
}

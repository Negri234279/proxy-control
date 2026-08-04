interface Props {
    present: boolean // el dominio tiene proxy host en NPM (si no, no aplica)
    enabled: boolean
    pending: boolean // habilitar/deshabilitar en vuelo
}

// Chip de CONTORNO (borde, no fondo tintado) para leerse como un eje distinto al de los
// badges de salud/sync (que son tintados). Color reservado al eje "energía" —accent/muted,
// NUNCA rojo— para no confundir "deshabilitado a propósito" con "error/missing" de sync.
function Chip({ color, glyph, label, pulsing }: { color: string; glyph: string; label: string; pulsing?: boolean }) {
    return (
        <span
            class={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${pulsing ? 'pc-pulse' : ''}`}
            style={{ color, borderColor: color }}
        >
            <span aria-hidden="true">{glyph}</span>
            <span>{label}</span>
        </span>
    )
}

// Estado (solo lectura) de habilitación del proxy host en NPM. La acción vive en el menú.
export function ActiveIndicator({ present, enabled, pending }: Props) {
    if (!present) {
        return <span class="text-[var(--color-neutral)]">—</span>
    }

    if (pending) {
        return <Chip color="var(--color-checking)" glyph="◍" label="Aplicando…" pulsing />
    }

    if (enabled) {
        return <Chip color="var(--color-accent)" glyph="◉" label="Activo" />
    }

    return <Chip color="var(--color-muted)" glyph="○" label="Inactivo" />
}

import { useDropdown } from '../hooks/useDropdown'

interface Props {
    options: string[]
    selected: string[]
    onToggle: (name: string) => void
    onClear: () => void
}

// Multiselect de hosts de Docker (multi-host): filtra la tabla por el daemon de origen.
// Opciones dinámicas (las pasa quien lo usa desde los datos). Vacío = todos los hosts.
export function HostFilter(props: Props) {
    const { open, toggle, close, containerRef } = useDropdown()
    const count = props.selected.length

    return (
        <div ref={containerRef} class="relative">
            <button
                type="button"
                onClick={toggle}
                aria-haspopup="true"
                aria-expanded={open}
                class="flex items-center gap-2 rounded-md border bg-transparent px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
            >
                <span class="text-[var(--color-muted)]">Host</span>
                {count > 0 ? (
                    <span
                        class="inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium"
                        style={{ backgroundColor: 'var(--color-accent)', color: '#0b0e14' }}
                    >
                        {count}
                    </span>
                ) : (
                    <span class="text-[var(--color-muted)]">Todos</span>
                )}
                <span aria-hidden="true" class="text-[var(--color-muted)]">
                    ▾
                </span>
            </button>

            {open ? (
                <div
                    role="listbox"
                    aria-multiselectable="true"
                    class="absolute z-20 mt-1 max-h-72 min-w-44 overflow-auto rounded-md border p-1 shadow-lg"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
                >
                    <button
                        type="button"
                        onClick={() => {
                            props.onClear()
                            close()
                        }}
                        class="w-full rounded px-2 py-1.5 text-left text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
                    >
                        Todos
                    </button>

                    <div class="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />

                    {props.options.map((name) => {
                        const checked = props.selected.includes(name)
                        return (
                            <label
                                key={name}
                                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--color-surface)]"
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => props.onToggle(name)}
                                    class="accent-[var(--color-accent)]"
                                />
                                <span class="truncate">{name}</span>
                            </label>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

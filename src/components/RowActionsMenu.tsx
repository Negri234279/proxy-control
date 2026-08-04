import { createPortal } from 'preact/compat'
import { useRowActionsMenu } from '../hooks/useRowActionsMenu'
import { Spinner } from './Spinner'

interface Props {
    hostname: string
    present: boolean // tiene proxy host en NPM → se puede habilitar/deshabilitar
    enabled: boolean
    reconciling: boolean
    pending: boolean // habilitar/deshabilitar en vuelo
    onReconcile: () => void
    onEdit: () => void
    onToggleEnabled: (next: boolean) => void
    onDelete: () => void
}

function MenuItem({
    glyph,
    label,
    onClick,
    disabled,
    danger,
}: {
    glyph: string
    label: string
    onClick: () => void
    disabled?: boolean
    danger?: boolean
}) {
    return (
        <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={disabled ? 'true' : 'false'}
            onClick={disabled ? undefined : onClick}
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-2)] focus:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-inset aria-disabled:opacity-40"
            style={danger ? { color: 'var(--color-error)' } : undefined}
        >
            <span aria-hidden="true" class="w-4 text-center">
                {glyph}
            </span>
            <span>{label}</span>
        </button>
    )
}

// Menú kebab (⋮) que agrupa las acciones de fila, como la lista de proxy hosts de NPM.
// Mientras la fila reconcilia, el trigger se sustituye por un spinner (no interactivo).
export function RowActionsMenu(props: Props) {
    const { open, position, openMenu, setOpen, menuRef, triggerRef, onMenuKeyDown } = useRowActionsMenu()

    if (props.reconciling) {
        return (
            <span class="inline-flex px-2 py-1" role="status" aria-label={`Reconciliando ${props.hostname}`}>
                <Spinner />
            </span>
        )
    }

    const busy = props.pending
    const run = (action: () => void) => {
        setOpen(false)
        action()
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Acciones de ${props.hostname}`}
                onClick={() => (open ? setOpen(false) : openMenu())}
                class="rounded-md p-2 text-base leading-none transition-colors hover:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
            >
                ⋮
            </button>

            {open && position
                ? createPortal(
                      <div
                          ref={menuRef}
                          role="menu"
                          aria-label={`Acciones de ${props.hostname}`}
                          onKeyDown={onMenuKeyDown}
                          class="fixed z-50 min-w-44 overflow-hidden rounded-md border py-1 shadow-lg"
                          style={{
                              left: `${position.left}px`,
                              top: `${position.top}px`,
                              transform: `translateX(-100%)${position.up ? ' translateY(-100%)' : ''}`,
                              borderColor: 'var(--color-border)',
                              backgroundColor: 'var(--color-surface)',
                          }}
                      >
                          <MenuItem glyph="↻" label="Reconciliar" onClick={() => run(props.onReconcile)} />
                          <MenuItem glyph="✎" label="Editar" onClick={() => run(props.onEdit)} />
                          {props.present ? (
                              <MenuItem
                                  glyph="⏻"
                                  label={props.enabled ? 'Deshabilitar' : 'Habilitar'}
                                  disabled={busy}
                                  onClick={() => run(() => props.onToggleEnabled(!props.enabled))}
                              />
                          ) : null}
                          <div role="separator" class="my-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
                          <MenuItem glyph="🗑" label="Eliminar" danger onClick={() => run(props.onDelete)} />
                      </div>,
                      document.body,
                  )
                : null}
        </>
    )
}

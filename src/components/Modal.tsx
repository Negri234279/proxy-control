import type { ComponentChildren } from 'preact'

interface Props {
    title: string
    onClose: () => void
    children: ComponentChildren
    footer?: ComponentChildren
}

// Shell de modal: overlay + tarjeta + cabecera con título y cierre. Cerrar al pulsar el
// fondo o el botón; el contenido detiene la propagación.
export function Modal({ title, onClose, children, footer }: Props) {
    return (
        <div
            class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
                class="mt-12 flex max-h-[calc(100vh-6rem)] w-full max-w-lg flex-col rounded-[var(--radius-card)] border"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
                <div
                    class="flex shrink-0 items-center justify-between border-b px-5 py-3"
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    <h2 class="text-base font-semibold">{title}</h2>
                    <button
                        type="button"
                        aria-label="Cerrar"
                        onClick={onClose}
                        class="text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    >
                        ✕
                    </button>
                </div>
                {/* Solo el cuerpo hace scroll: cabecera y footer (con el CTA) quedan siempre visibles. */}
                <div class="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer ? (
                    <div
                        class="flex shrink-0 justify-end gap-2 border-t px-5 py-3"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

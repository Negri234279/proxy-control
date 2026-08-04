import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'

interface Props {
    title: string
    onClose: () => void
    children: ComponentChildren
    footer?: ComponentChildren
}

// Shell de modal sobre <dialog> nativo: showModal() aporta focus trap, fondo inert,
// Esc y restauración del foco al cerrar. El <dialog> actúa de overlay transparente y el
// oscurecido lo pinta ::backdrop; la tarjeta interior conserva el layout (arriba + scroll).
export function Modal({ title, onClose, children, footer }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null)

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return

        if (!dialog.open) {
            dialog.showModal()
        }

        return () => {
            if (dialog.open) {
                dialog.close()
            }
        }
    }, [])

    const requestClose = () => dialogRef.current?.close()

    // Único punto de sincronía: cualquier cierre nativo (Esc, ✕, backdrop, cierre por el
    // padre) emite el evento close y propaga el estado hacia arriba.
    const onNativeClose = () => onClose()

    const onOverlayClick = (event: MouseEvent) => {
        if (event.target === event.currentTarget) {
            requestClose()
        }
    }

    return (
        <dialog
            ref={dialogRef}
            aria-label={title}
            onClose={onNativeClose}
            class="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-y-auto bg-transparent p-0 backdrop:bg-black/60"
        >
            <div class="flex min-h-full items-start justify-center p-4" onClick={onOverlayClick}>
                <div
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
                            onClick={requestClose}
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
        </dialog>
    )
}

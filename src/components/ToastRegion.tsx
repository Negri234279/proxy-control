import type { Toast } from '../hooks/useToasts'

interface Props {
    toasts: Toast[]
    onDismiss: (id: number) => void
}

const KIND_COLOR: Record<Toast['kind'], string> = {
    success: 'var(--color-synced)',
    error: 'var(--color-error)',
    info: 'var(--color-accent)',
}

export function ToastRegion({ toasts, onDismiss }: Props) {
    return (
        <div class="fixed top-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    class="flex items-start gap-3 rounded-lg border p-3 text-sm shadow-lg"
                    style={{
                        borderColor: KIND_COLOR[toast.kind],
                        backgroundColor: 'var(--color-surface-2)',
                    }}
                >
                    <span
                        class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: KIND_COLOR[toast.kind] }}
                    />
                    <span class="flex-1">{toast.message}</span>
                    <button
                        type="button"
                        aria-label="Cerrar"
                        onClick={() => onDismiss(toast.id)}
                        class="text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    )
}

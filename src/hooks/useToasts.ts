import { useCallback, useState } from 'preact/hooks'

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
    id: number
    kind: ToastKind
    message: string
}

let nextId = 1

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    const push = useCallback(
        (kind: ToastKind, message: string) => {
            const id = nextId++
            setToasts((prev) => [...prev, { id, kind, message }])
            setTimeout(() => dismiss(id), 6000)
        },
        [dismiss],
    )

    return { toasts, push, dismiss }
}

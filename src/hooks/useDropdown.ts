import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

// Estado mínimo de un dropdown anclado en el flujo (no portal): apertura y cierre por click
// fuera del panel/trigger y por Escape. Mantiene el componente declarativo (las islas Preact
// extraen su estado a hooks).
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
    const [open, setOpen] = useState(false)
    const containerRef = useRef<T>(null)

    const close = useCallback(() => setOpen(false), [])
    const toggle = useCallback(() => setOpen((value) => !value), [])

    useEffect(() => {
        if (!open) {
            return
        }

        const onDocClick = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }

        document.addEventListener('mousedown', onDocClick)
        document.addEventListener('keydown', onKeyDown)

        return () => {
            document.removeEventListener('mousedown', onDocClick)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [open])

    return {
        open,
        toggle,
        close,
        containerRef,
    }
}

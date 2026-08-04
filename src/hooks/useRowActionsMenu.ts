import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

export interface MenuPosition {
    left: number
    top: number
    up: boolean // se abre hacia arriba (no cabía debajo)
}

// Lógica del menú kebab de acciones de fila. El menú se renderiza en un PORTAL con posición
// fija (para no ser recortado por el `overflow-x-auto` de la tabla) y se ancla al trigger.
// Cubre: apertura con posición/volteo, cierre por click fuera / Esc / Tab / scroll / resize,
// y navegación de foco con teclado (roving) sobre los `menuitem` no deshabilitados. Mantiene
// el componente declarativo (las islas Preact extraen su estado a hooks).
const ESTIMATED_MENU_HEIGHT = 220

export function useRowActionsMenu() {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<MenuPosition | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    const close = useCallback((returnFocus = true) => {
        setOpen(false)
        if (returnFocus) {
            triggerRef.current?.focus()
        }
    }, [])

    const computePosition = useCallback((): MenuPosition | null => {
        const rect = triggerRef.current?.getBoundingClientRect()
        if (!rect) {
            return null
        }
        const up = rect.bottom + ESTIMATED_MENU_HEIGHT > window.innerHeight
        return {
            // `left` es el borde derecho de anclaje (el menú se extiende a la izquierda con
            // translateX(-100%)); se clampa al viewport para que no se salga en pantallas estrechas.
            left: Math.min(window.innerWidth - 8, Math.max(8, rect.right)),
            top: up ? rect.top - 4 : rect.bottom + 4,
            up,
        }
    }, [])

    const openMenu = useCallback(() => {
        const next = computePosition()
        if (!next) {
            return
        }
        setPosition(next)
        setOpen(true)
    }, [computePosition])

    const items = useCallback((): HTMLElement[] => {
        const nodes = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
        return nodes ? Array.from(nodes) : []
    }, [])

    // Cierra al hacer click fuera del menú y su trigger.
    useEffect(() => {
        if (!open) {
            return
        }
        const onDocClick = (event: MouseEvent) => {
            const target = event.target as Node
            if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [open])

    // Al hacer scroll/resize, RE-ANCLA el menú al trigger (posición fija) en vez de cerrarlo de
    // golpe; solo lo cierra si el trigger ha salido del viewport. El scroll se escucha en captura
    // para pillar también scrolls de contenedores internos.
    useEffect(() => {
        if (!open) {
            return
        }
        const reposition = () => {
            const rect = triggerRef.current?.getBoundingClientRect()
            if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
                setOpen(false)
                return
            }
            setPosition(computePosition())
        }
        window.addEventListener('scroll', reposition, true)
        window.addEventListener('resize', reposition)
        return () => {
            window.removeEventListener('scroll', reposition, true)
            window.removeEventListener('resize', reposition)
        }
    }, [open, computePosition])

    // Al abrir, mueve el foco al primer item accionable.
    useEffect(() => {
        if (open) {
            items()[0]?.focus()
        }
    }, [open, items])

    const onMenuKeyDown = useCallback(
        (event: KeyboardEvent) => {
            const list = items()
            if (list.length === 0) {
                return
            }
            const index = list.indexOf(document.activeElement as HTMLElement)

            if (event.key === 'ArrowDown') {
                event.preventDefault()
                list[(index + 1) % list.length].focus()
            } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                list[(index - 1 + list.length) % list.length].focus()
            } else if (event.key === 'Home') {
                event.preventDefault()
                list[0].focus()
            } else if (event.key === 'End') {
                event.preventDefault()
                list[list.length - 1].focus()
            } else if (event.key === 'Escape') {
                event.preventDefault()
                close()
            } else if (event.key === 'Tab') {
                setOpen(false)
            }
        },
        [items, close],
    )

    return {
        open,
        position,
        openMenu,
        close,
        setOpen,
        triggerRef,
        menuRef,
        onMenuKeyDown,
    }
}

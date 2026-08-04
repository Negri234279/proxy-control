import { navigate } from 'astro:transitions/client'
import { useState } from 'preact/hooks'
import { useCreateDomain } from '../hooks/useCreateDomain'
import { useDeleteDomain } from '../hooks/useDeleteDomain'
import { useToasts } from '../hooks/useToasts'
import { api, type ApiError } from '../lib/api'
import type { DomainListItem } from '../lib/domain-types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { DomainFormModal } from './DomainFormModal'
import { Spinner } from './Spinner'
import { ToastRegion } from './ToastRegion'

// Barra de acciones de la página de detalle: reutiliza el mismo formulario de edición,
// el diálogo de borrado y los toasts que la tabla. Tras una mutación exitosa RE-RENDERIZA
// la página con una navegación soft de Astro (fetch + swap del DOM, sin recarga dura): datos
// frescos del SSR sin flash. Los errores se muestran como toast (no navega, así persisten).
const btnBase =
    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none'

export function DomainDetailActions({ row }: { row: DomainListItem }) {
    const { toasts, push, dismiss } = useToasts()
    const [reconciling, setReconciling] = useState(false)
    const [toggling, setToggling] = useState(false)

    // Refresca la propia página (mismo id) con navegación soft: re-pide el SSR y hace swap.
    const refresh = async () => {
        await navigate(window.location.pathname + window.location.search)
    }
    const goHome = async () => {
        await navigate('/')
    }

    const create = useCreateDomain({ refetch: refresh, pushToast: push })
    const del = useDeleteDomain({ refetch: goHome, pushToast: push })

    const busy = reconciling || toggling || create.submitting || del.submitting
    const canToggle = Boolean(row.npmProxyId)

    const reconcile = async () => {
        if (!row.id) return

        setReconciling(true)

        try {
            await api.reconcileOne(row.id)
            await refresh()
        } catch (error) {
            push('error', `Reconciliar falló: ${(error as ApiError).message}`)
            setReconciling(false)
        }
    }

    const toggleEnabled = async () => {
        if (!row.npmProxyId) return

        const next = !row.enabledInNpm
        setToggling(true)

        try {
            await api.setEnabled(row.npmProxyId, next)
            await refresh()
        } catch (error) {
            push('error', `No se pudo ${next ? 'habilitar' : 'deshabilitar'}: ${(error as ApiError).message}`)
            setToggling(false)
        }
    }

    return (
        <div class="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={() => create.openEdit(row)}
                disabled={busy}
                class={btnBase}
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
            >
                ✎ Editar
            </button>

            <button
                type="button"
                onClick={reconcile}
                disabled={busy}
                class={`${btnBase} border hover:bg-[var(--color-surface-2)]`}
                style={{ borderColor: 'var(--color-border)' }}
            >
                {reconciling ? <Spinner size={14} /> : '↻'} Reconciliar
            </button>

            {canToggle ? (
                <button
                    type="button"
                    onClick={toggleEnabled}
                    disabled={busy}
                    class={`${btnBase} border hover:bg-[var(--color-surface-2)]`}
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    {toggling ? <Spinner size={14} /> : '⏻'} {row.enabledInNpm ? 'Deshabilitar' : 'Habilitar'}
                </button>
            ) : null}

            <button
                type="button"
                onClick={() => del.open(row)}
                disabled={busy}
                class={`${btnBase} border hover:bg-[var(--color-surface-2)]`}
                style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
            >
                🗑 Eliminar
            </button>

            <DomainFormModal create={create} />
            <DeleteConfirmDialog
                row={del.pending}
                removeDns={del.removeDns}
                setRemoveDns={del.setRemoveDns}
                submitting={del.submitting}
                onConfirm={del.confirm}
                onClose={del.close}
            />
            <ToastRegion toasts={toasts} onDismiss={dismiss} />
        </div>
    )
}

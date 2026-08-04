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
// el diálogo de borrado y los toasts que la tabla. Tras una mutación exitosa recarga la
// página (SSR) para reflejar el estado nuevo; los errores se muestran como toast sin recargar.
const btnBase =
    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none'

export function DomainDetailActions({ row }: { row: DomainListItem }) {
    const { toasts, push, dismiss } = useToasts()
    const [reconciling, setReconciling] = useState(false)
    const [toggling, setToggling] = useState(false)

    const reload = async () => {
        window.location.reload()
    }

    const goHome = async () => {
        window.location.href = '/'
    }

    const create = useCreateDomain({ refetch: reload, pushToast: push })
    const del = useDeleteDomain({ refetch: goHome, pushToast: push })

    const busy = reconciling || toggling || create.submitting || del.submitting
    const canToggle = Boolean(row.npmProxyId)

    const reconcile = async () => {
        if (!row.id) return

        setReconciling(true)

        try {
            await api.reconcileOne(row.id)
            await reload()
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
            await reload()
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

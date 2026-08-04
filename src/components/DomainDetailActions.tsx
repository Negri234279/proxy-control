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

interface Props {
    row: DomainListItem
    // Refresca los datos del detalle EN SITIO (sin navegar). Se llama tras editar/reconciliar/toggle.
    onMutated: () => Promise<void>
    // Tras borrar el dominio ya no hay página que mostrar: el contenedor decide a dónde ir.
    onDeleted: () => void
}

const btnBase =
    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none'

// Barra de acciones de la página de detalle. Reutiliza el formulario de edición, el diálogo
// de borrado y los toasts de la tabla; tras cada mutación refresca los datos EN SITIO (sin
// recargar ni navegar), así los toasts de éxito persisten.
export function DomainDetailActions({ row, onMutated, onDeleted }: Props) {
    const { toasts, push, dismiss } = useToasts()
    const [reconciling, setReconciling] = useState(false)
    const [toggling, setToggling] = useState(false)

    const create = useCreateDomain({ refetch: onMutated, pushToast: push })
    const del = useDeleteDomain({ refetch: async () => onDeleted(), pushToast: push })

    const busy = reconciling || toggling || create.submitting || del.submitting
    const canToggle = Boolean(row.npmProxyId)

    const reconcile = async () => {
        if (!row.id) return

        setReconciling(true)

        try {
            const domain = await api.reconcileOne(row.id)

            await onMutated()

            push(domain.reconcileState === 'synced' ? 'success' : 'info', `${row.hostname}: ${domain.reconcileState}`)
        } catch (error) {
            push('error', `Reconciliar falló: ${(error as ApiError).message}`)
        } finally {
            setReconciling(false)
        }
    }

    const toggleEnabled = async () => {
        if (!row.npmProxyId) return

        const next = !row.enabledInNpm
        setToggling(true)

        try {
            await api.setEnabled(row.npmProxyId, next)
            await onMutated()
            
            push('success', `${row.hostname} ${next ? 'habilitado' : 'deshabilitado'}`)
        } catch (error) {
            push('error', `No se pudo ${next ? 'habilitar' : 'deshabilitar'}: ${(error as ApiError).message}`)
        } finally {
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

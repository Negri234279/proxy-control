import { useState } from 'preact/hooks'
import { useCreateDomain } from '../hooks/useCreateDomain'
import { useDeleteDomain } from '../hooks/useDeleteDomain'
import { useDomainFilters } from '../hooks/useDomainFilters'
import { useDomains } from '../hooks/useDomains'
import { useDomainStatus } from '../hooks/useDomainStatus'
import { usePolling } from '../hooks/usePolling'
import { useReconcile } from '../hooks/useReconcile'
import { useToasts } from '../hooks/useToasts'
import { useToggleEnabled } from '../hooks/useToggleEnabled'
import { AppHeader } from './AppHeader'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { DomainFormModal } from './DomainFormModal'
import { DomainsTable } from './DomainsTable'
import { DomainsToolbar } from './DomainsToolbar'
import { ToastRegion } from './ToastRegion'

// Isla raíz: compone los hooks (toda la lógica de estado) y los componentes.
export function DomainsApp({ authEnabled = false }: { authEnabled?: boolean }) {
    const { toasts, push, dismiss } = useToasts()
    const { status, domains, refetch, applyStatusSnapshot, patchRow, patchByNpmId } = useDomains()
    const [pollingEnabled, setPollingEnabled] = useState(true)
    const polling = usePolling(applyStatusSnapshot, pollingEnabled)
    const filters = useDomainFilters(domains)
    const reconcile = useReconcile({ patchRow, refetch, pushToast: push, setPollingEnabled })
    const create = useCreateDomain({ refetch, pushToast: push })
    const del = useDeleteDomain({ refetch, pushToast: push })
    const domainStatus = useDomainStatus()
    const toggleEnabled = useToggleEnabled({ patchByNpmId, pushToast: push })

    return (
        <div class="mx-auto max-w-6xl px-4 py-8">
            <AppHeader
                lastUpdatedAt={polling.lastUpdatedAt}
                pollingFailed={polling.failed}
                fleetRunning={reconcile.fleetRunning}
                authEnabled={authEnabled}
                onReconcileAll={reconcile.reconcileAll}
                onAdd={create.openAdd}
            />

            <DomainsToolbar
                query={filters.query}
                setQuery={filters.setQuery}
                visibility={filters.visibility}
                setVisibility={filters.setVisibility}
                state={filters.state}
                setState={filters.setState}
                count={filters.filtered.length}
            />

            <DomainsTable
                status={status}
                rows={filters.filtered}
                reconcilingIds={reconcile.reconcilingIds}
                domainStatus={domainStatus}
                togglingIds={toggleEnabled.togglingIds}
                onToggleEnabled={toggleEnabled.toggle}
                onReconcile={reconcile.reconcileOne}
                onEdit={create.openEdit}
                onDelete={del.open}
                onClassify={create.openClassify}
                onRetry={refetch}
                onAdd={create.openAdd}
            />

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

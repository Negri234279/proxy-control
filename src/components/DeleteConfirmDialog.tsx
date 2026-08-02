import type { DomainListItem } from '../lib/domain-types'
import { dnsProviderLabel } from '../lib/reconcile-state'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { Toggle } from './Toggle'

interface Props {
    row: DomainListItem | null
    removeDns: boolean
    setRemoveDns: (value: boolean) => void
    submitting: boolean
    onConfirm: () => void
    onClose: () => void
}

export function DeleteConfirmDialog(props: Props) {
    if (!props.row) {
        return null
    }

    const provider = dnsProviderLabel(props.row.visibility)

    return (
        <Modal
            title="Eliminar dominio"
            onClose={props.onClose}
            footer={
                <>
                    <button
                        type="button"
                        onClick={props.onClose}
                        class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={props.onConfirm}
                        disabled={props.submitting}
                        class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-error)' }}
                    >
                        {props.submitting ? <Spinner size={14} /> : null}
                        Eliminar
                    </button>
                </>
            }
        >
            <div class="flex flex-col gap-4 text-sm">
                <p>
                    Vas a eliminar <span class="font-semibold">{props.row.hostname}</span> del panel y su proxy host en
                    NPM.
                </p>
                {provider ? (
                    <Toggle
                        checked={props.removeDns}
                        onChange={props.setRemoveDns}
                        label={`Eliminar también el registro DNS en ${provider}`}
                    />
                ) : null}
                <p class="text-xs text-[var(--color-muted)]">
                    Por defecto se conserva el registro DNS para no tumbar el servicio por accidente.
                </p>
            </div>
        </Modal>
    )
}

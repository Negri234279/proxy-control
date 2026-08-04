import type { DomainListItem } from '../lib/domain-types'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface Props {
    row: DomainListItem | null
    submitting: boolean
    onConfirm: () => void
    onClose: () => void
}

// Confirmación de habilitar/deshabilitar el proxy host en NPM. Deshabilitar deja el
// servicio inaccesible, por eso se pide confirmación explícita como en el borrado. El
// destino se deriva del estado actual (`enabledInNpm`).
export function ToggleEnabledConfirmDialog(props: Props) {
    if (!props.row) {
        return null
    }

    const disabling = props.row.enabledInNpm
    const action = disabling ? 'Deshabilitar' : 'Habilitar'

    return (
        <Modal
            title={`${action} dominio`}
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
                        style={{ backgroundColor: disabling ? 'var(--color-error)' : 'var(--color-accent)' }}
                    >
                        {props.submitting ? <Spinner size={14} /> : null}
                        {action}
                    </button>
                </>
            }
        >
            <div class="flex flex-col gap-4 text-sm">
                {disabling ? (
                    <>
                        <p>
                            Vas a deshabilitar <span class="font-semibold">{props.row.hostname}</span> en NPM.
                        </p>
                        <p class="text-xs text-[var(--color-muted)]">
                            NPM dejará de servir este proxy host y el servicio quedará inaccesible hasta que lo vuelvas
                            a habilitar. No se toca el DNS.
                        </p>
                    </>
                ) : (
                    <>
                        <p>
                            Vas a habilitar <span class="font-semibold">{props.row.hostname}</span> en NPM.
                        </p>
                        <p class="text-xs text-[var(--color-muted)]">NPM volverá a servir este proxy host.</p>
                    </>
                )}
            </div>
        </Modal>
    )
}

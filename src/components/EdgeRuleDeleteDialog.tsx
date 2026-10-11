import type { EdgeRuleView } from '../lib/domain-types'
import { Modal } from './Modal'
import { Spinner } from './Spinner'

interface Props {
    rule: EdgeRuleView | null
    submitting: boolean
    error: string | null
    onConfirm: () => void
    onClose: () => void
}

// Confirmación de borrado de una regla de borde (Cloudflare). A diferencia del borrado de
// dominio, no hay toggle de DNS: elimina la regla en Cloudflare y su fila. Si la regla sigue
// declarada (no huérfana), la próxima reconciliación la recreará; se avisa en el copy.
export function EdgeRuleDeleteDialog(props: Props) {
    if (!props.rule) {
        return null
    }

    const { rule } = props

    return (
        <Modal
            title="Eliminar regla de borde"
            onClose={props.onClose}
            canClose={!props.submitting}
            footer={
                <>
                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={props.submitting}
                        class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none disabled:opacity-60"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={props.onConfirm}
                        disabled={props.submitting}
                        class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none disabled:opacity-60"
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
                    Vas a eliminar la regla <span class="font-semibold">{rule.description}</span> de Cloudflare
                    {rule.ruleId ? (
                        <>
                            {' '}
                            (<span class="font-mono text-xs">rule_id: {rule.ruleId}</span>)
                        </>
                    ) : null}
                    .
                </p>
                {rule.orphaned ? (
                    <p class="text-xs text-[var(--color-muted)]">
                        Esta regla ya no está declarada (huérfana), así que no se recreará.
                    </p>
                ) : (
                    <p class="text-xs text-[var(--color-muted)]">
                        No modifica la declaración en YAML/labels: si sigue declarada, la próxima reconciliación la
                        volverá a crear.
                    </p>
                )}
                {props.error ? (
                    <p role="alert" class="text-xs" style={{ color: 'var(--color-error)' }}>
                        {props.error}
                    </p>
                ) : null}
            </div>
        </Modal>
    )
}

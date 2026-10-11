import type { EdgeRuleView } from '../lib/domain-types'
import type { RowState } from '../lib/reconcile-state'
import { OrphanPill } from './OrphanPill'
import { StatusBadge } from './StatusBadge'

interface Props {
    rule: EdgeRuleView
    onDelete: (rule: EdgeRuleView) => void
}

const kindLabel = (kind: EdgeRuleView['kind']): string => (kind === 'ratelimit' ? 'Rate limit' : 'WAF')

// Línea legible de los parámetros de rate limiting (vacía en WAF).
function rateLimitSummary(rule: EdgeRuleView): string | null {
    if (rule.kind !== 'ratelimit') {
        return null
    }

    const { requestsPerPeriod, period, mitigationTimeout, characteristics } = rule.config
    const parts = [`${requestsPerPeriod ?? '?'} req / ${period ?? '?'}s`]
    if (mitigationTimeout !== undefined) {
        parts.push(`bloqueo ${mitigationTimeout}s`)
    }

    if (characteristics && characteristics.length > 0) {
        parts.push(`por ${characteristics.join(', ')}`)
    }

    return parts.join(' · ')
}

// Cualificador del rule_id según el estado (ausente / huérfana), para dar contexto en una línea.
function ruleIdQualifier(rule: EdgeRuleView): string | null {
    if (rule.orphaned) {
        return 'no está declarada; revísala o elimínala'
    }

    if (!rule.present) {
        return 'declarada, ausente en Cloudflare'
    }

    return null
}

// Una regla de borde: badge de estado + tipo + pill huérfano + borrar; luego descripción,
// expresión (acotada por host al reconciliar), parámetros de rate-limit, rule_id y motivos.
export function EdgeRuleRow({ rule, onDelete }: Props) {
    const summary = rateLimitSummary(rule)
    const qualifier = ruleIdQualifier(rule)
    // Solo se puede borrar en Cloudflare lo que existe allí (hay rule_id).
    const deletable = rule.ruleId !== null
    // Cloudflare no consultable: el estado en vivo es DESCONOCIDO, no un error de la regla. Se
    // muestra neutro ('sin clasificar') en vez de rojo, para no leerse como "la regla falla".
    const unreachable = rule.reasons?.some((reason) => reason.startsWith('no se pudo consultar Cloudflare')) ?? false
    const badgeState: RowState = unreachable ? 'unclassified' : rule.state

    return (
        <li
            class="flex flex-col gap-1.5 rounded-md border p-3 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
            role="group"
            aria-label={rule.description}
        >
            <div class="flex flex-wrap items-center gap-2">
                <StatusBadge state={badgeState} provider="Cloudflare" />
                <span
                    class="rounded-full border px-1.5 py-0.5 text-[11px] tracking-wide uppercase"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                >
                    {kindLabel(rule.kind)}
                </span>
                {rule.orphaned ? (
                    <OrphanPill title="Huérfano: existe en Cloudflare pero ya no está declarada; revísala o elimínala" />
                ) : null}
                <button
                    type="button"
                    onClick={() => deletable && onDelete(rule)}
                    aria-disabled={!deletable}
                    aria-label={`Eliminar regla de borde ${rule.description}`}
                    title={deletable ? 'Eliminar regla de borde' : 'No hay nada que eliminar en Cloudflare'}
                    class={`ml-auto rounded-md border px-2 py-1 text-xs text-[var(--color-muted)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none ${
                        deletable ? 'hover:text-[var(--color-error)]' : 'cursor-not-allowed opacity-40'
                    }`}
                    style={{ borderColor: 'var(--color-border)' }}
                >
                    Eliminar
                </button>
            </div>

            <p>{rule.description}</p>

            <p class="font-mono text-xs break-all text-[var(--color-muted)]">
                {rule.expression} → {rule.action}
            </p>

            {summary ? <p class="font-mono text-xs text-[var(--color-muted)]">{summary}</p> : null}

            <p class="font-mono text-xs text-[var(--color-muted)]">
                rule_id: {rule.ruleId ?? '—'}
                {qualifier ? ` · ${qualifier}` : ''}
            </p>

            {rule.reasons && rule.reasons.length > 0 ? (
                <ul class="mt-1 ml-4 flex list-disc flex-col gap-0.5 text-xs" style={{ color: 'var(--color-drift)' }}>
                    {rule.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            ) : null}
        </li>
    )
}

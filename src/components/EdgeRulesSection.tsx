import { useEdgeRuleDelete } from '../hooks/useEdgeRuleDelete'
import type { EdgeRuleView } from '../lib/domain-types'
import { EdgeRuleDeleteDialog } from './EdgeRuleDeleteDialog'
import { EdgeRuleRow } from './EdgeRuleRow'

interface Props {
    domainId: string
    rules: EdgeRuleView[]
    onDeleted: () => void | Promise<void>
}

const isCloudflareUnreachable = (rule: EdgeRuleView): boolean =>
    rule.reasons?.some((reason) => reason.startsWith('no se pudo consultar Cloudflare')) ?? false

// Contenido de la sección "Reglas de borde" (se monta solo en dominios públicos proxied). Solo
// lectura + borrado explícito: el alta/edición es declarativa (YAML/labels). La degradación por
// fallo de Cloudflare se muestra como nota y las reglas declaradas se listan igualmente.
export function EdgeRulesSection({ domainId, rules, onDeleted }: Props) {
    const del = useEdgeRuleDelete(domainId, onDeleted)
    const degraded = rules.some(isCloudflareUnreachable)

    if (rules.length === 0) {
        return (
            <p class="text-sm text-[var(--color-muted)]">
                Sin reglas de borde. Se declaran por YAML o labels de Docker (WAF / rate-limit) y aparecerán aquí tras
                reconciliar.
            </p>
        )
    }

    return (
        <div class="flex flex-col gap-3">
            {degraded ? (
                <p class="text-xs text-[var(--color-muted)]">
                    No se pudo consultar Cloudflare; se muestran las reglas declaradas (estado en vivo desconocido).
                    Revisa las incidencias de arriba.
                </p>
            ) : null}

            <ul class="flex flex-col gap-2">
                {rules.map((rule) => (
                    <EdgeRuleRow key={rule.ruleId ?? rule.id} rule={rule} onDelete={del.request} />
                ))}
            </ul>

            <EdgeRuleDeleteDialog
                rule={del.pending}
                submitting={del.submitting}
                error={del.error}
                onConfirm={del.confirm}
                onClose={del.cancel}
            />
        </div>
    )
}

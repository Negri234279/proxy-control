import { deleteEdgeRule } from '../../../../../server/domain/edge-sync'
import { getDomainOrThrow } from '../../../../../server/domain/get-domain'
import { json, requireParam, route } from '../../../../../server/http/error-response'

// Borrado explícito de una regla de borde de un dominio (la elimina en Cloudflare y en la DB).
// Es la única vía de borrado: las fuentes declarativas solo marcan huérfanas las reglas retiradas.
export const DELETE = route(async ({ params }) => {
    const id = requireParam(params.id)
    const ruleId = requireParam(params.ruleId)
    const domain = await getDomainOrThrow(id)
    await deleteEdgeRule(domain, ruleId)

    return json({ ok: true })
})

import { getDomainOrThrow } from '../../../../server/domain/get-domain'
import { json, requireParam, route } from '../../../../server/http/error-response'
import { diff } from '../../../../server/reconcile/diff'

export const GET = route(async ({ params }) => {
    const id = requireParam(params.id)
    const domain = await getDomainOrThrow(id)
    const status = await diff(domain)
    return json({ status })
})

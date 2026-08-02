import { reconcileDomain } from '../../../../server/domain/reconcile-domain'
import { json, requireParam, route } from '../../../../server/http/error-response'

export const POST = route(async ({ params }) => {
    const id = requireParam(params.id)
    const domain = await reconcileDomain(id)
    return json({ domain })
})

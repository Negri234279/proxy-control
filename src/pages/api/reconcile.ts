import { reconcileAll } from '../../server/domain/reconcile-domain'
import { json, route } from '../../server/http/error-response'

export const POST = route(async () => {
    const results = await reconcileAll()
    return json({ results })
})

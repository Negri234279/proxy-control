import { listStatus } from '../../server/domain/list-status'
import { json, route } from '../../server/http/error-response'

export const GET = route(async () => {
    const status = await listStatus()
    return json({ status })
})

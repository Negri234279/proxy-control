import { createDomain } from '../../../server/domain/create-domain'
import { listDomains } from '../../../server/domain/list-domains'
import { json, readJson, route } from '../../../server/http/error-response'
import { parseCreateDomainInput } from '../../../server/validation/domain'

export const GET = route(async () => {
    const domains = await listDomains()
    return json({ domains })
})

export const POST = route(async ({ request }) => {
    const input = parseCreateDomainInput(await readJson(request))
    const domain = await createDomain(input)
    return json({ domain }, 201)
})

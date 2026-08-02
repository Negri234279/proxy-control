import { deleteDomain } from '../../../server/domain/delete-domain'
import { updateDomain } from '../../../server/domain/update-domain'
import { json, readJson, requireParam, route } from '../../../server/http/error-response'
import { parseUpdateDomainInput } from '../../../server/validation/domain'

export const PATCH = route(async ({ params, request }) => {
    const id = requireParam(params.id)
    const patch = parseUpdateDomainInput(await readJson(request))
    const domain = await updateDomain(id, patch)
    return json({ domain })
})

export const DELETE = route(async ({ params, url }) => {
    const id = requireParam(params.id)
    const removeDns = url.searchParams.get('removeDns') === 'true'
    await deleteDomain(id, { removeDns })
    return json({ ok: true })
})

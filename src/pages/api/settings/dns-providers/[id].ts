import { NotFoundError } from '../../../../server/errors'
import { json, readJson, requireParam, route } from '../../../../server/http/error-response'
import { deleteProvider, toProviderView, updateProvider } from '../../../../server/settings/dns-providers'
import { parseUpdateProviderInput } from '../../../../server/validation/dns-provider'

export const PATCH = route(async ({ params, request }) => {
    const id = requireParam(params.id)
    const patch = parseUpdateProviderInput(await readJson(request))
    const provider = await updateProvider(id, patch)
    if (!provider) {
        throw new NotFoundError('Proveedor no encontrado')
    }
    return json({ provider: toProviderView(provider) })
})

export const DELETE = route(async ({ params }) => {
    const id = requireParam(params.id)
    await deleteProvider(id)
    return json({ ok: true })
})

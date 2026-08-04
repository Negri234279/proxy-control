import { json, readJson, route } from '../../../../server/http/error-response'
import { createProvider, listProviders, toProviderView } from '../../../../server/settings/dns-providers'
import { parseCreateProviderInput } from '../../../../server/validation/dns-provider'

// Proveedores DNS configurables (panel). Los secretos NUNCA se devuelven: `toProviderView`
// solo expone si hay secreto o no.
export const GET = route(async () => {
    const providers = await listProviders()
    return json({ providers: providers.map(toProviderView) })
})

export const POST = route(async ({ request }) => {
    const input = parseCreateProviderInput(await readJson(request))
    const provider = await createProvider(input)
    return json({ provider: toProviderView(provider) }, 201)
})

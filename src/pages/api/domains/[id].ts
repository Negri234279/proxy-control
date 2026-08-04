import { env } from '../../../server/config/env'
import { deleteDomain } from '../../../server/domain/delete-domain'
import { getDomainOrThrow } from '../../../server/domain/get-domain'
import { updateDomain } from '../../../server/domain/update-domain'
import { json, readJson, requireParam, route } from '../../../server/http/error-response'
import { diff } from '../../../server/reconcile/diff'
import { parseUpdateDomainInput } from '../../../server/validation/domain'

// Detalle completo de un dominio: fila de la DB + estado en vivo (NPM + Cloudflare/Mikrotik).
// Lo consume la página de detalle para refrescar en sitio tras una mutación, sin recargar.
export const GET = route(async ({ params }) => {
    const id = requireParam(params.id)
    const domain = await getDomainOrThrow(id)
    const status = await diff(domain)

    return json({ domain, status, publicIp: env.PUBLIC_IP ?? null })
})

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

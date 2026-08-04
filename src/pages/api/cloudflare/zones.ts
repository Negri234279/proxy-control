import { json, route } from '../../../server/http/error-response'
import { listZones } from '../../../server/providers/cloudflare'
import { resolveCloudflare } from '../../../server/settings/dns-providers'

// Zonas accesibles con el token del proveedor Cloudflare habilitado (para el selector del
// formulario de dominio). 502 si no hay proveedor configurado o el token falla.
export const GET = route(async () => {
    const cf = await resolveCloudflare()
    const zones = await listZones(cf.token)
    return json({ zones: zones.map((zone) => ({ id: zone.id, name: zone.name })) })
})

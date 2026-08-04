import { ValidationError } from '../../../../../server/errors'
import { json, readJson, requireParam, route } from '../../../../../server/http/error-response'
import { setProxyHostEnabled } from '../../../../../server/providers/npm'

// Habilita/deshabilita un proxy host de NPM (mismo efecto que su toggle). Se enruta por el
// id del proxy host (no el uuid del dominio) para que funcione también con hosts sin
// clasificar, que existen en NPM pero aún no tienen fila en nuestra DB.
export const POST = route(async ({ params, request }) => {
    const proxyId = Number(requireParam(params.id))
    if (!Number.isInteger(proxyId) || proxyId <= 0) {
        throw new ValidationError('Id de proxy host inválido', { id: 'debe ser un número positivo' })
    }

    const body = (await readJson(request)) as { enabled?: unknown }
    if (typeof body.enabled !== 'boolean') {
        throw new ValidationError('Falta el campo enabled', { enabled: 'requerido (boolean)' })
    }

    await setProxyHostEnabled(proxyId, body.enabled)

    return json({ enabled: body.enabled })
})

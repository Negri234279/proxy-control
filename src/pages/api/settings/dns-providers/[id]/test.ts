import { NotFoundError, ProviderError, ValidationError } from '../../../../../server/errors'
import { json, requireParam, route } from '../../../../../server/http/error-response'
import { listZones } from '../../../../../server/providers/cloudflare'
import { listStaticDns } from '../../../../../server/providers/mikrotik'
import {
    decryptSecret,
    getProvider,
    type CloudflareSecret,
    type MikrotikConfig,
    type MikrotikSecret,
} from '../../../../../server/settings/dns-providers'

// Prueba de conectividad del proveedor guardado (lectura barata contra su API).
export const POST = route(async ({ params }) => {
    const provider = await getProvider(requireParam(params.id))
    if (!provider) {
        throw new NotFoundError('Proveedor no encontrado')
    }

    if (provider.kind === 'cloudflare') {
        const secret = decryptSecret<CloudflareSecret>(provider)
        if (!secret?.apiToken) {
            throw new ProviderError('cloudflare', 'El proveedor no tiene token')
        }

        const zones = await listZones(secret.apiToken)

        return json({ ok: true, detail: `${zones.length} zona(s) accesibles` })
    }

    if (provider.kind === 'mikrotik') {
        const config = provider.config as unknown as MikrotikConfig
        const secret = decryptSecret<MikrotikSecret>(provider)
        if (!config.baseUrl || !config.user || !secret?.password) {
            throw new ProviderError('mikrotik', 'Config de Mikrotik incompleta')
        }

        const entries = await listStaticDns({
            baseUrl: config.baseUrl,
            user: config.user,
            password: secret.password,
            tlsInsecure: config.tlsInsecure ?? false,
        })
        
        return json({ ok: true, detail: `${entries.length} entrada(s) DNS estáticas` })
    }

    throw new ValidationError('Prueba no soportada para este proveedor', { kind: 'no soportado' })
})

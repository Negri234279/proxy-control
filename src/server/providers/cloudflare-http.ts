import { ProviderError } from '../errors'
import { fetchJson } from './http'

// Transporte compartido de la API de Cloudflare: añade el Bearer token, desenvuelve el
// sobre `{ success, errors, result }` y convierte un fallo lógico en `ProviderError`. Lo usan
// tanto el cliente de DNS (`cloudflare.ts`) como el de Rulesets (`cloudflare-rulesets.ts`).
// Sin lógica de negocio: solo HTTP. El token nunca se incluye en los mensajes de error.

export const CF_BASE = 'https://api.cloudflare.com/client/v4'

export interface CfEnvelope<T> {
    success: boolean
    errors: { code: number; message: string }[]
    result: T
}

export async function cfJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
    const envelope = await fetchJson<CfEnvelope<T>>(`${CF_BASE}${path}`, {
        ...init,
        provider: 'cloudflare',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...init.headers,
        },
    })

    if (!envelope.success) {
        const detail = envelope.errors.map((error) => `${error.code} ${error.message}`).join('; ')
        throw new ProviderError('cloudflare', `Cloudflare rechazó la petición: ${detail}`)
    }

    return envelope.result
}

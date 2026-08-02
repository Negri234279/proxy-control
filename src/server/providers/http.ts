import { ProviderError, type ProviderName } from '../errors'

interface FetchJsonOptions extends RequestInit {
    provider: ProviderName
}

// Wrapper de `fetch` para providers sobre HTTP(S) con cert válido (NPM, Cloudflare).
// Convierte fallos de red y respuestas no-2xx en `ProviderError`. Mikrotik usa su
// propio cliente (node:https) por el certificado self-signed.
export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
    const { provider, ...init } = options

    let response: Response
    
    try {
        response = await fetch(url, init)
    } catch (cause) {
        throw new ProviderError(provider, `No se pudo contactar con ${provider}`, { cause })
    }

    const text = await response.text()

    if (!response.ok) {
        throw new ProviderError(provider, `${provider} respondió ${response.status}: ${text.slice(0, 300)}`, {
            status: response.status,
        })
    }

    if (!text) return undefined as T

    try {
        return JSON.parse(text) as T
    } catch (cause) {
        throw new ProviderError(provider, `Respuesta no-JSON de ${provider}`, { cause })
    }
}

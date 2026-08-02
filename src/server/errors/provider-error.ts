export type ProviderName = 'npm' | 'cloudflare' | 'mikrotik'

interface ProviderErrorOptions {
    status?: number
    cause?: unknown
}

// Fallo al hablar con un proveedor externo (NPM / Cloudflare / Mikrotik). Se mapea a
// HTTP 502. `status` guarda el código que devolvió el proveedor, si lo hubo.
export class ProviderError extends Error {
    readonly provider: ProviderName
    readonly status?: number

    constructor(provider: ProviderName, message: string, options: ProviderErrorOptions = {}) {
        super(message, { cause: options.cause })
        this.name = 'ProviderError'
        this.provider = provider
        this.status = options.status
    }
}

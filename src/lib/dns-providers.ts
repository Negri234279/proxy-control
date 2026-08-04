// Tipos y metadata de PRESENTACIÓN de los proveedores DNS, compartidos front/back. Los
// descriptores por `kind` describen los campos de cada proveedor y cuáles son secretos, para
// generar los formularios del panel y decidir qué se cifra.

export type DnsProviderScope = 'public' | 'private'
export type DnsProviderKind = 'cloudflare' | 'mikrotik'

export interface ProviderField {
    key: string
    label: string
    type: 'text' | 'password' | 'boolean'
    // Los campos `secret` viajan cifrados (columna `secret`); el resto van en `config`.
    secret?: boolean
    optional?: boolean
    placeholder?: string
    help?: string
}

export interface ProviderKindDescriptor {
    kind: DnsProviderKind
    scope: DnsProviderScope
    label: string
    fields: ProviderField[]
}

export const PROVIDER_KINDS: ProviderKindDescriptor[] = [
    {
        kind: 'cloudflare',
        scope: 'public',
        label: 'Cloudflare',
        fields: [
            {
                key: 'apiToken',
                label: 'API Token',
                type: 'password',
                secret: true,
                placeholder: 'token con permisos de DNS',
                help: 'Se cargan todas las zonas accesibles con este token.',
            },
            {
                key: 'defaultPublicIp',
                label: 'IP pública por defecto',
                type: 'text',
                optional: true,
                placeholder: 'p. ej. 203.0.113.10 (para registros A)',
            },
            {
                key: 'defaultZoneId',
                label: 'Zona por defecto (id)',
                type: 'text',
                optional: true,
                placeholder: 'opcional; se puede elegir por dominio',
            },
        ],
    },
    {
        kind: 'mikrotik',
        scope: 'private',
        label: 'Mikrotik (RouterOS)',
        fields: [
            { key: 'baseUrl', label: 'URL base', type: 'text', placeholder: 'https://192.168.88.1' },
            { key: 'user', label: 'Usuario', type: 'text' },
            { key: 'password', label: 'Contraseña', type: 'password', secret: true },
            {
                key: 'tlsInsecure',
                label: 'Aceptar certificado self-signed (TLS inseguro)',
                type: 'boolean',
            },
            {
                key: 'npmInternalIp',
                label: 'IP interna de NPM',
                type: 'text',
                placeholder: 'destino de las entradas DNS estáticas',
            },
        ],
    },
]

export function descriptorFor(kind: string): ProviderKindDescriptor | undefined {
    return PROVIDER_KINDS.find((descriptor) => descriptor.kind === kind)
}

// Vista de un proveedor para el panel: config no-secreta + si tiene secreto (nunca el valor).
export interface DnsProviderView {
    id: string
    kind: string
    scope: DnsProviderScope
    name: string
    config: Record<string, unknown>
    hasSecret: boolean
    enabled: boolean
}

export const SCOPE_LABEL: Record<DnsProviderScope, string> = {
    public: 'DNS público',
    private: 'DNS privado',
}

import type { NpmOptions } from './domain-types'

// Etiquetas de presentación de las opciones del proxy host de NPM. Compartidas por el
// formulario de alta/editar y la página de detalle.
export const NPM_OPTION_LABELS: { key: keyof NpmOptions; label: string }[] = [
    { key: 'blockExploits', label: 'Block common exploits' },
    { key: 'websockets', label: 'Websockets' },
    { key: 'cacheAssets', label: 'Cache assets' },
    { key: 'http2', label: 'HTTP/2' },
    { key: 'hsts', label: 'HSTS' },
    { key: 'hstsSubdomains', label: 'HSTS Subdomains' },
    { key: 'forceSsl', label: 'Force SSL' },
    { key: 'trustForwardedProto', label: 'Trust forwarded proto header' },
]

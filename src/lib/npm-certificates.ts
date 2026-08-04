// Casa un certificado de NPM con un hostname: por nombre exacto, por su base (domain.es) o
// por el wildcard (*.domain.es). Mismo criterio que la resolución wildcard del servidor,
// para preseleccionar en el formulario el cert que cubre el dominio.

export function certificateBaseWildcard(hostname: string): { base: string; wildcard: string } {
    const base = hostname.split('.').slice(1).join('.')
    
    return {
        base,
        wildcard: `*.${base}`,
    }
}

export function matchCertificate<T extends { domainNames: string[] }>(
    hostname: string,
    certificates: T[],
): T | undefined {
    const host = hostname.trim().toLowerCase().replace(/\.$/, '')
    if (!host) return undefined

    const { base, wildcard } = certificateBaseWildcard(host)

    return certificates.find((certificate) => {
        const names = certificate.domainNames.map((name) => name.toLowerCase())
        return names.includes(host) || names.includes(wildcard) || names.includes(base)
    })
}

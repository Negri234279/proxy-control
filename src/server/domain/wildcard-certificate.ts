import { ValidationError } from '../errors'
import { listCertificates } from '../providers/npm'

// Deriva el wildcard/base de un hostname: app.domain.es → { wildcard: '*.domain.es', base: 'domain.es' }.
function wildcardFor(hostname: string): { wildcard: string; base: string } {
    const base = hostname.split('.').slice(1).join('.')
    return {
        wildcard: `*.${base}`,
        base,
    }
}

// Localiza en NPM el id de un certificado que cubre el hostname: por nombre exacto,
// por su base (domain.es) o por el wildcard (*.domain.es). Mismo criterio que la web
// (matchCertificate). Devuelve null si ninguno lo cubre.
export async function findCertificateIdForHostname(hostname: string): Promise<number | null> {
    const host = hostname.trim().toLowerCase().replace(/\.$/, '')
    if (!host) return null

    const { wildcard, base } = wildcardFor(host)
    const certificates = await listCertificates()

    const match = certificates.find((certificate) => {
        const names = certificate.domain_names.map((name) => name.toLowerCase())
        return names.includes(host) || names.includes(wildcard) || names.includes(base)
    })

    return match ? match.id : null
}

// Igual que findCertificateIdForHostname pero exige que exista: los dominios privados
// reutilizan el cert wildcard (DNS-01) existente y no emiten uno nuevo.
export async function resolveWildcardCertificateId(hostname: string): Promise<number> {
    const id = await findCertificateIdForHostname(hostname)

    if (id === null) {
        const { wildcard } = wildcardFor(hostname)
        throw new ValidationError(`No hay un certificado wildcard para ${wildcard} en NPM`, {
            hostname: `falta el certificado wildcard ${wildcard}`,
        })
    }

    return id
}

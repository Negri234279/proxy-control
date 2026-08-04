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

// Localiza en NPM el id del certificado wildcard (DNS-01) que cubre el hostname privado.
// Los dominios privados reutilizan este cert existente; no emiten uno nuevo.
export async function resolveWildcardCertificateId(hostname: string): Promise<number> {
    const { wildcard, base } = wildcardFor(hostname)
    const certificates = await listCertificates()

    const match = certificates.find(
        (certificate) => certificate.domain_names.includes(wildcard) || certificate.domain_names.includes(base),
    )

    if (!match) {
        throw new ValidationError(`No hay un certificado wildcard para ${wildcard} en NPM`, {
            hostname: `falta el certificado wildcard ${wildcard}`,
        })
    }

    return match.id
}

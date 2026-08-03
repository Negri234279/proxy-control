import { json, route } from '../../../server/http/error-response'
import { listCertificates } from '../../../server/providers/npm'

// Lista de certificados de NPM (para el selector de SSL del formulario de alta).
export const GET = route(async () => {
    const certificates = await listCertificates()
    return json({
        certificates: certificates.map((certificate) => ({
            id: certificate.id,
            niceName: certificate.nice_name,
            domainNames: certificate.domain_names,
        })),
    })
})

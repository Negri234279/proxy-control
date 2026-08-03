import { useEffect, useState } from 'preact/hooks'
import { api, type NpmCertificateOption } from '../lib/api'

// Carga la lista de certificados de NPM para el selector SSL. Si falla, se queda vacía
// (el formulario sigue ofreciendo "solicitar uno nuevo").
export function useNpmCertificates() {
    const [certificates, setCertificates] = useState<NpmCertificateOption[]>([])

    useEffect(() => {
        let cancelled = false
        api.certificates()
            .then((certs) => {
                if (!cancelled) {
                    setCertificates(certs)
                }
            })
            .catch(() => {
                // Sin lista: el selector solo ofrecerá "solicitar uno nuevo".
            })
        return () => {
            cancelled = true
        }
    }, [])

    return certificates
}

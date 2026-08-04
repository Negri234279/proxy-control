import { useCallback } from 'preact/hooks'
import type { NpmCertificateOption } from '../lib/api'
import { matchCertificate } from '../lib/npm-certificates'
import type { useCreateDomain } from './useCreateDomain'

type CreateDomain = ReturnType<typeof useCreateDomain>

// Devuelve un handler para el BLUR del hostname: en ALTA, si aún no se ha elegido cert
// ('new'), preselecciona el que casa con el dominio (exacto, base `domain.es` o wildcard
// `*.domain.es`). No pisa una elección manual ni el valor de edición.
export function useCertificateSelector(create: CreateDomain, certificates: NpmCertificateOption[]): () => void {
    const { mode, form, setField } = create

    return useCallback(() => {
        if (mode !== 'add' || form.certificateId !== 'new' || certificates.length === 0) {
            return
        }
        const match = matchCertificate(form.hostname, certificates)
        if (match) {
            setField('certificateId', String(match.id))
        }
    }, [mode, form.certificateId, form.hostname, certificates, setField])
}

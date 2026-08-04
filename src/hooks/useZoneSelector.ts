import { useEffect, useState } from 'preact/hooks'
import { api } from '../lib/api'
import { matchZone, type CloudflareZone } from '../lib/dns-providers'
import type { useCreateDomain } from './useCreateDomain'

type CreateDomain = ReturnType<typeof useCreateDomain>

// Carga las zonas de Cloudflare y, al CREAR un dominio público, preselecciona la que casa con
// el hostname (sin coincidencia → ninguna). No pisa una elección manual ni el valor de edición.
export function useZoneSelector(create: CreateDomain) {
    const [zones, setZones] = useState<CloudflareZone[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        api.cloudflareZones()
            .then((result) => {
                if (!cancelled) {
                    setZones(result)
                }
            })
            .catch(() => {
                // Sin zonas: el selector muestra el aviso de configurar el token.
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [])

    const { mode, form, setZone } = create

    useEffect(() => {
        if (mode !== 'add' || form.visibility !== 'public' || form.cfZoneId || zones.length === 0) {
            return
        }
        
        const match = matchZone(form.hostname, zones)
        if (match) {
            setZone(match.id, match.name)
        }
    }, [mode, form.visibility, form.cfZoneId, form.hostname, zones, setZone])

    return {
        zones,
        loading,
    }
}

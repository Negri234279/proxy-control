import { describe, expect, it } from 'vitest'
import { descriptorFor, matchZone, type CloudflareZone } from './dns-providers'

describe('descriptorFor', () => {
    it('devuelve el descriptor de un kind conocido con su scope', () => {
        expect(descriptorFor('cloudflare')).toMatchObject({ kind: 'cloudflare', scope: 'public' })
        expect(descriptorFor('mikrotik')).toMatchObject({ kind: 'mikrotik', scope: 'private' })
    })

    it('marca como secretos los campos sensibles', () => {
        const cf = descriptorFor('cloudflare')!
        expect(cf.fields.find((f) => f.key === 'apiToken')?.secret).toBe(true)
        expect(cf.fields.find((f) => f.key === 'defaultPublicIp')?.secret).toBeUndefined()
    })

    it('undefined para un kind desconocido', () => {
        expect(descriptorFor('route53')).toBeUndefined()
    })
})

describe('matchZone', () => {
    const zones: CloudflareZone[] = [
        { id: 'z1', name: 'negri.es' },
        { id: 'z2', name: 'sub.negri.es' },
        { id: 'z3', name: 'otra.com' },
    ]

    it('elige la zona más específica (sufijo más largo)', () => {
        expect(matchZone('app.sub.negri.es', zones)?.id).toBe('z2')
    })

    it('casa por sufijo de punto, no por substring', () => {
        expect(matchZone('app.negri.es', zones)?.id).toBe('z1')
        expect(matchZone('xnegri.es', zones)).toBeUndefined()
    })

    it('casa el apex exacto', () => {
        expect(matchZone('negri.es', zones)?.id).toBe('z1')
    })

    it('undefined si no hay coincidencia o el host está vacío', () => {
        expect(matchZone('app.example.org', zones)).toBeUndefined()
        expect(matchZone('', zones)).toBeUndefined()
    })
})

import { describe, expect, it } from 'vitest'
import { isHostname } from './hostname'

describe('isHostname', () => {
    it('acepta FQDNs válidos', () => {
        expect(isHostname('app.domain.es')).toBe(true)
        expect(isHostname('pve-web.negri.es')).toBe(true)
        expect(isHostname('a.b.c.example.com')).toBe(true)
    })

    it('rechaza comodines y hostnames incompletos', () => {
        expect(isHostname('*.domain.es')).toBe(false)
        expect(isHostname('localhost')).toBe(false)
        expect(isHostname('domain')).toBe(false)
    })

    it('rechaza formatos inválidos', () => {
        expect(isHostname('')).toBe(false)
        expect(isHostname('-bad.domain.es')).toBe(false)
        expect(isHostname('espacio .domain.es')).toBe(false)
        expect(isHostname('app..domain.es')).toBe(false)
    })
})

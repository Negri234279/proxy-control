import { describe, expect, it } from 'vitest'
import { isIpv4 } from './ip'

describe('isIpv4', () => {
    it('acepta IPv4 válidas', () => {
        expect(isIpv4('192.168.1.1')).toBe(true)
        expect(isIpv4('0.0.0.0')).toBe(true)
        expect(isIpv4('255.255.255.255')).toBe(true)
    })

    it('rechaza octetos fuera de rango', () => {
        expect(isIpv4('256.1.1.1')).toBe(false)
        expect(isIpv4('1.1.1.300')).toBe(false)
    })

    it('rechaza formatos no IPv4', () => {
        expect(isIpv4('1.2.3')).toBe(false)
        expect(isIpv4('1.2.3.4.5')).toBe(false)
        expect(isIpv4('a.b.c.d')).toBe(false)
        expect(isIpv4('')).toBe(false)
        expect(isIpv4('example.com')).toBe(false)
    })
})

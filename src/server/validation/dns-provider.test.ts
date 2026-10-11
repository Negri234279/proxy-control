import { describe, expect, it } from 'vitest'
import { ValidationError } from '../errors'
import { parseCreateProviderInput, parseUpdateProviderInput } from './dns-provider'

describe('parseCreateProviderInput', () => {
    it('deriva el scope del descriptor del kind (no lo acepta del cliente)', () => {
        const input = parseCreateProviderInput({
            kind: 'cloudflare',
            name: 'CF',
            config: { defaultZoneId: 'z1' },
            secret: { apiToken: 't' },
        })
        expect(input).toMatchObject({ kind: 'cloudflare', scope: 'public', name: 'CF' })
    })

    it('mikrotik deriva scope private', () => {
        expect(parseCreateProviderInput({ kind: 'mikrotik', name: 'MK' }).scope).toBe('private')
    })

    it('secret null por defecto cuando no se envía', () => {
        expect(parseCreateProviderInput({ kind: 'mikrotik', name: 'MK' }).secret).toBeNull()
    })

    it('rechaza un kind no soportado', () => {
        try {
            parseCreateProviderInput({ kind: 'route53', name: 'x' })
            throw new Error('debería lanzar')
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError)
            expect((error as ValidationError).fields.kind).toBeDefined()
        }
    })

    it('rechaza payload sin name', () => {
        expect(() => parseCreateProviderInput({ kind: 'cloudflare' })).toThrow(ValidationError)
    })
})

describe('parseUpdateProviderInput', () => {
    it('acepta un patch parcial', () => {
        expect(parseUpdateProviderInput({ enabled: false })).toEqual({ enabled: false })
    })

    it('rechaza claves desconocidas (strict)', () => {
        expect(() => parseUpdateProviderInput({ scope: 'public' })).toThrow(ValidationError)
    })
})

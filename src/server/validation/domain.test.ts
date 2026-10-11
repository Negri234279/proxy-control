import { describe, expect, it } from 'vitest'
import { ValidationError } from '../errors'
import { parseCreateDomainInput, parseUpdateDomainInput } from './domain'

const fieldsOf = (fn: () => unknown): Record<string, string> => {
    try {
        fn()
    } catch (error) {
        return (error as ValidationError).fields
    }
    throw new Error('se esperaba que lanzara')
}

describe('parseCreateDomainInput', () => {
    it('acepta un público válido con forward', () => {
        const input = parseCreateDomainInput({
            hostname: 'app.negri.es',
            visibility: 'public',
            forwardScheme: 'http',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
        })
        expect(input).toMatchObject({ hostname: 'app.negri.es', visibility: 'public', forwardPort: 8080 })
    })

    it('rechaza hostname inválido', () => {
        expect(
            fieldsOf(() =>
                parseCreateDomainInput({
                    hostname: '*.negri.es',
                    visibility: 'public',
                    forwardScheme: 'http',
                    forwardHost: 'x',
                    forwardPort: 1,
                }),
            ).hostname,
        ).toBeDefined()
    })

    it('exige upstream cuando no es dnsOnly', () => {
        const fields = fieldsOf(() =>
            parseCreateDomainInput({ hostname: 'app.negri.es', visibility: 'public', forwardScheme: 'http' }),
        )
        expect(fields.forwardHost).toBeDefined()
        expect(fields.forwardPort).toBeDefined()
    })

    it('dnsOnly privado exige dnsTarget IPv4', () => {
        expect(
            fieldsOf(() =>
                parseCreateDomainInput({
                    hostname: 'nas.negri.es',
                    visibility: 'private',
                    forwardScheme: 'http',
                    dnsOnly: true,
                    dnsTarget: 'no-ip',
                }),
            ).dnsTarget,
        ).toMatch(/IPv4/)
    })

    it('un registro A público con content no-IPv4 se rechaza', () => {
        expect(
            fieldsOf(() =>
                parseCreateDomainInput({
                    hostname: 'app.negri.es',
                    visibility: 'public',
                    forwardScheme: 'http',
                    forwardHost: '10.0.0.5',
                    forwardPort: 8080,
                    cfRecordType: 'A',
                    cfContent: 'no-ip',
                }),
            ).cfContent,
        ).toMatch(/IPv4/)
    })

    it('acepta certificateId "new" o numérico', () => {
        const base = {
            hostname: 'app.negri.es',
            visibility: 'public',
            forwardScheme: 'http',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
        } as const
        expect(parseCreateDomainInput({ ...base, certificateId: 'new' }).certificateId).toBe('new')
        expect(parseCreateDomainInput({ ...base, certificateId: 12 }).certificateId).toBe(12)
    })
})

describe('parseUpdateDomainInput', () => {
    it('acepta un patch parcial con nullables', () => {
        expect(parseUpdateDomainInput({ cfContent: null, certificateId: null })).toEqual({
            cfContent: null,
            certificateId: null,
        })
    })

    it('rechaza claves desconocidas (strict)', () => {
        expect(() => parseUpdateDomainInput({ foo: 1 })).toThrow(ValidationError)
    })
})

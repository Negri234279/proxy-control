import { describe, expect, it } from 'vitest'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import { desiredCfContent, desiredCfRecord, desiredProxyHostInput } from './desired'

const domain = (overrides: Partial<Domain> = {}): Domain =>
    ({
        hostname: 'app.negri.es',
        visibility: 'public',
        forwardScheme: 'http',
        forwardHost: '10.0.0.5',
        forwardPort: 8080,
        npmOptions: DEFAULT_NPM_OPTIONS,
        customLocations: [],
        advancedConfig: '',
        cfRecordType: 'A',
        cfContent: '203.0.113.10',
        cfProxied: true,
        ...overrides,
    }) as Domain

describe('desiredProxyHostInput', () => {
    it('construye el input del proxy host sin DNS challenge', () => {
        const input = desiredProxyHostInput(domain(), 'new')
        expect(input).toMatchObject({
            hostname: 'app.negri.es',
            forwardScheme: 'http',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
            certificateId: 'new',
            dnsChallenge: false,
        })
        expect(input.npmOptions).toMatchObject(DEFAULT_NPM_OPTIONS)
    })

    it('lanza si falta upstream', () => {
        expect(() => desiredProxyHostInput(domain({ forwardHost: null }), 'new')).toThrow()
        expect(() => desiredProxyHostInput(domain({ forwardPort: null }), 'new')).toThrow()
    })
})

describe('desiredCfContent', () => {
    const defaults = { defaultPublicIp: '203.0.113.1', defaultCname: 'origin.negri.es' }

    it('usa el cfContent del dominio si lo hay', () => {
        expect(desiredCfContent(domain({ cfContent: '9.9.9.9' }), defaults)).toBe('9.9.9.9')
    })

    it('cae al default por tipo (A → IP, CNAME → host)', () => {
        expect(desiredCfContent(domain({ cfContent: null }), defaults)).toBe('203.0.113.1')
        expect(desiredCfContent(domain({ cfContent: null, cfRecordType: 'CNAME' }), defaults)).toBe('origin.negri.es')
    })

    it('lanza si no hay contenido ni default', () => {
        expect(() =>
            desiredCfContent(domain({ cfContent: null }), { defaultPublicIp: null, defaultCname: null }),
        ).toThrow()
    })
})

describe('desiredCfRecord', () => {
    it('mapea el registro deseado', () => {
        const record = desiredCfRecord(domain(), { defaultPublicIp: null, defaultCname: null })
        expect(record).toEqual({ name: 'app.negri.es', type: 'A', content: '203.0.113.10', proxied: true })
    })
})

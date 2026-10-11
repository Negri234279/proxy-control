import { describe, expect, it } from 'vitest'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import type { DomainSpec } from '../validation/domain-spec'
import { desiredFromSpec, matches } from './spec-sync'

const cfDefaults = { defaultPublicIp: '203.0.113.1', defaultCname: null }

const spec = (overrides: Partial<DomainSpec> = {}): DomainSpec => ({
    hostname: 'app.negri.es',
    visibility: 'public',
    forwardScheme: 'http',
    forwardHost: '10.0.0.5',
    forwardPort: 8080,
    ...overrides,
})

describe('desiredFromSpec', () => {
    it('público: usa cfContent de la spec y mezcla npmOptions con los defaults', () => {
        const desired = desiredFromSpec(spec({ cfContent: '9.9.9.9', npmOptions: { websockets: true } }), cfDefaults)
        expect(desired.visibility).toBe('public')
        expect(desired.cfContent).toBe('9.9.9.9')
        expect(desired.cfProxied).toBe(true)
        expect(desired.npmOptions).toMatchObject({ ...DEFAULT_NPM_OPTIONS, websockets: true })
    })

    it('público sin cfContent: cae al default del proveedor para registro A', () => {
        expect(desiredFromSpec(spec(), cfDefaults).cfContent).toBe('203.0.113.1')
    })

    it('privado: cfContent y cfZoneId quedan null', () => {
        const desired = desiredFromSpec(spec({ visibility: 'private' }), cfDefaults)
        expect(desired.cfContent).toBeNull()
        expect(desired.cfZoneId).toBeNull()
    })

    it('dnsOnly privado: fija dnsTarget', () => {
        const desired = desiredFromSpec(
            spec({ visibility: 'private', dnsOnly: true, dnsTarget: '192.168.1.20' }),
            cfDefaults,
        )
        expect(desired.dnsOnly).toBe(true)
        expect(desired.dnsTarget).toBe('192.168.1.20')
    })
})

describe('matches', () => {
    const desired = desiredFromSpec(spec({ cfContent: '9.9.9.9' }), cfDefaults)

    const rowFromDesired = (): Domain =>
        ({
            visibility: desired.visibility,
            dnsOnly: desired.dnsOnly,
            dnsTarget: desired.dnsTarget,
            forwardScheme: desired.forwardScheme,
            forwardHost: desired.forwardHost,
            forwardPort: desired.forwardPort,
            certificateId: desired.certificateId,
            cfRecordType: desired.cfRecordType,
            cfContent: desired.cfContent,
            cfProxied: desired.cfProxied,
            cfZoneId: desired.cfZoneId,
            advancedConfig: desired.advancedConfig,
            npmOptions: desired.npmOptions,
            customLocations: desired.customLocations,
        }) as Domain

    it('true cuando la fila coincide con lo deseado', () => {
        expect(matches(rowFromDesired(), desired)).toBe(true)
    })

    it('false ante un cambio de un campo escalar', () => {
        expect(matches({ ...rowFromDesired(), cfContent: '1.1.1.1' } as Domain, desired)).toBe(false)
    })

    it('false ante un cambio en npmOptions (compara JSON)', () => {
        const row = { ...rowFromDesired(), npmOptions: { ...DEFAULT_NPM_OPTIONS, websockets: true } } as Domain
        expect(matches(row, desired)).toBe(false)
    })
})

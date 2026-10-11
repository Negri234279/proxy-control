import { describe, expect, it } from 'vitest'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import type { NpmProxyHost } from '../providers/npm'
import { cloudflareCheck, mikrotikCheck, npmCheck, resolveState } from './diff'

const domain = (overrides: Partial<Domain> = {}): Domain =>
    ({
        hostname: 'app.negri.es',
        visibility: 'public',
        dnsOnly: false,
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

const syncedHost = (overrides: Partial<NpmProxyHost> = {}): NpmProxyHost =>
    ({
        id: 1,
        domain_names: ['app.negri.es'],
        forward_scheme: 'http',
        forward_host: '10.0.0.5',
        forward_port: 8080,
        enabled: true,
        certificate_id: 7,
        block_exploits: true,
        allow_websocket_upgrade: false,
        caching_enabled: false,
        http2_support: true,
        hsts_enabled: true,
        hsts_subdomains: true,
        ssl_forced: true,
        trust_forwarded_proto: false,
        advanced_config: '',
        locations: [],
        ...overrides,
    }) as NpmProxyHost

describe('npmCheck', () => {
    it('ausente cuando no hay proxy host', () => {
        const check = npmCheck(domain(), undefined)
        expect(check.present).toBe(false)
        expect(check.drift).toBe(false)
    })

    it('synced cuando el host coincide con el deseado', () => {
        const check = npmCheck(domain(), syncedHost())
        expect(check.present).toBe(true)
        expect(check.drift).toBe(false)
    })

    it('detecta drift de un flag y lo reporta', () => {
        const check = npmCheck(domain(), syncedHost({ ssl_forced: false }))
        expect(check.drift).toBe(true)
        expect(check.reasons?.join(' ')).toMatch(/force_ssl/)
    })

    it('tolera flags como 0/1 (versiones antiguas de NPM)', () => {
        const check = npmCheck(domain(), syncedHost({ block_exploits: 1, ssl_forced: 1, http2_support: 1 }))
        expect(check.drift).toBe(false)
    })

    it('marca "sin certificado SSL" cuando certificate_id es 0', () => {
        const check = npmCheck(domain(), syncedHost({ certificate_id: 0 }))
        expect(check.reasons?.join(' ')).toMatch(/certificado/)
    })
})

describe('cloudflareCheck', () => {
    const defaults = { defaultPublicIp: null, defaultCname: null }

    it('ausente cuando no hay registro', () => {
        expect(cloudflareCheck(domain(), undefined, defaults).present).toBe(false)
    })

    it('synced cuando el registro coincide', () => {
        const record = { id: 'r1', type: 'A', name: 'app.negri.es', content: '203.0.113.10', proxied: true }
        expect(cloudflareCheck(domain(), record, defaults).drift).toBe(false)
    })

    it('detecta drift de content y de proxied', () => {
        const record = { id: 'r1', type: 'A', name: 'app.negri.es', content: '1.1.1.1', proxied: false }
        const check = cloudflareCheck(domain(), record, defaults)
        expect(check.drift).toBe(true)
        expect(check.reasons?.join(' ')).toMatch(/content/)
        expect(check.reasons?.join(' ')).toMatch(/proxied/)
    })
})

describe('mikrotikCheck', () => {
    it('ausente cuando no hay entrada', () => {
        expect(mikrotikCheck(undefined, '192.168.1.2').present).toBe(false)
    })

    it('synced cuando la dirección coincide', () => {
        const entry = { '.id': '*1', name: 'app.negri.es', address: '192.168.1.2' }
        expect(mikrotikCheck(entry, '192.168.1.2').drift).toBe(false)
    })

    it('drift cuando la dirección difiere', () => {
        const entry = { '.id': '*1', name: 'app.negri.es', address: '192.168.1.9' }
        expect(mikrotikCheck(entry, '192.168.1.2').drift).toBe(true)
    })
})

describe('resolveState', () => {
    const present = { present: true, drift: false }
    const missing = { present: false, drift: false }
    const drifted = { present: true, drift: true }

    it('error gana sobre todo', () => {
        expect(resolveState({ errored: true, npm: present, dns: present })).toBe('error')
    })

    it('missing si falta NPM o DNS', () => {
        expect(resolveState({ errored: false, npm: missing, dns: present })).toBe('missing')
        expect(resolveState({ errored: false, npm: present, dns: missing })).toBe('missing')
    })

    it('drift si alguno tiene drift', () => {
        expect(resolveState({ errored: false, npm: drifted, dns: present })).toBe('drift')
    })

    it('synced cuando ambos presentes y sin drift', () => {
        expect(resolveState({ errored: false, npm: present, dns: present })).toBe('synced')
    })

    it('en dnsOnly ignora NPM', () => {
        expect(resolveState({ errored: false, npm: missing, dns: present, dnsOnly: true })).toBe('synced')
        expect(resolveState({ errored: false, npm: present, dns: missing, dnsOnly: true })).toBe('missing')
    })
})

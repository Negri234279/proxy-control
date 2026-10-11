import { describe, expect, it } from 'vitest'
import type { DnsProvider } from '../db/schema'
import { cloudflareDefaultContent, toProviderView } from './dns-providers'

const provider = (overrides: Partial<DnsProvider> = {}): DnsProvider =>
    ({
        id: 'p1',
        kind: 'cloudflare',
        scope: 'public',
        name: 'CF',
        config: { defaultZoneId: 'z1' },
        secret: 'v1:iv:tag:cipher',
        enabled: true,
        ...overrides,
    }) as DnsProvider

describe('toProviderView', () => {
    it('expone config y hasSecret, NUNCA el secreto', () => {
        const view = toProviderView(provider())
        expect(view).toEqual({
            id: 'p1',
            kind: 'cloudflare',
            scope: 'public',
            name: 'CF',
            config: { defaultZoneId: 'z1' },
            hasSecret: true,
            enabled: true,
        })
        expect(JSON.stringify(view)).not.toContain('cipher')
    })

    it('hasSecret false cuando no hay secreto', () => {
        expect(toProviderView(provider({ secret: null })).hasSecret).toBe(false)
    })
})

describe('cloudflareDefaultContent', () => {
    const defaults = { defaultPublicIp: '203.0.113.1', defaultCname: 'origin.negri.es' }

    it('A → IP pública por defecto', () => {
        expect(cloudflareDefaultContent('A', defaults)).toBe('203.0.113.1')
    })

    it('CNAME → host destino por defecto', () => {
        expect(cloudflareDefaultContent('CNAME', defaults)).toBe('origin.negri.es')
    })

    it('null si no hay default para el tipo', () => {
        expect(cloudflareDefaultContent('A', { defaultPublicIp: null, defaultCname: null })).toBeNull()
    })
})

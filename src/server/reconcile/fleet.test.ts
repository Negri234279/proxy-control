import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import type { NpmProxyHost } from '../providers/npm'

const mocks = vi.hoisted(() => ({
    resolveCloudflare: vi.fn(),
    resolveMikrotik: vi.fn(),
    listRecords: vi.fn(),
    listStaticDns: vi.fn(),
}))

vi.mock('../settings/dns-providers', () => ({
    resolveCloudflare: mocks.resolveCloudflare,
    resolveMikrotik: mocks.resolveMikrotik,
    cloudflareDefaultContent: (type: string, d: any) => (type === 'CNAME' ? d.defaultCname : d.defaultPublicIp),
}))
vi.mock('../providers/cloudflare', () => ({ listRecords: mocks.listRecords, findRecord: vi.fn() }))
vi.mock('../providers/mikrotik', () => ({ listStaticDns: mocks.listStaticDns }))

const { computeFleetState } = await import('./diff')

const publicDomain = {
    id: 'p',
    hostname: 'app.negri.es',
    visibility: 'public',
    dnsOnly: false,
    cfZoneId: null,
    cfRecordType: 'A',
    cfContent: '1.1.1.1',
    cfProxied: true,
    cloudflareRecordId: 'rec1',
    npmOptions: DEFAULT_NPM_OPTIONS,
    customLocations: [],
    advancedConfig: '',
    forwardScheme: 'http',
    forwardHost: '10.0.0.5',
    forwardPort: 8080,
} as unknown as Domain

const privateDomain = { id: 'q', hostname: 'nas.negri.es', visibility: 'private', dnsOnly: false } as unknown as Domain

const syncedHost: NpmProxyHost = {
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
} as NpmProxyHost

beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveCloudflare.mockResolvedValue({
        token: 't',
        defaultZoneId: 'z',
        defaultPublicIp: '1.1.1.1',
        defaultCname: null,
    })
    mocks.resolveMikrotik.mockResolvedValue({ npmInternalIp: '192.168.1.2' })
    mocks.listRecords.mockResolvedValue([
        { id: 'rec1', type: 'A', name: 'app.negri.es', content: '1.1.1.1', proxied: true },
    ])
    mocks.listStaticDns.mockResolvedValue([])
})

describe('computeFleetState', () => {
    it('público synced y privado missing', async () => {
        const map = await computeFleetState([publicDomain, privateDomain], [syncedHost])
        expect(map.get('p')).toEqual({ state: 'synced', npm: 'synced', dns: 'synced' })
        expect(map.get('q')!.state).toBe('missing')
    })

    it('aísla un fallo de Cloudflare a los dominios públicos', async () => {
        mocks.resolveCloudflare.mockRejectedValue(new Error('cf caído'))
        const map = await computeFleetState([publicDomain, privateDomain], [syncedHost])
        expect(map.get('p')!.dns).toBe('error')
        expect(map.get('q')!.state).toBe('missing') // el privado no se ve afectado
    })

    it('ignora los dominios sin clasificar', async () => {
        const map = await computeFleetState([{ id: 'u', visibility: 'unclassified' } as Domain], [])
        expect(map.has('u')).toBe(false)
    })
})

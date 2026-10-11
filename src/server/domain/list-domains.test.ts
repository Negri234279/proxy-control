import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ listProxyHosts: vi.fn(), computeFleetState: vi.fn() }))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('../providers/npm', () => ({
    listProxyHosts: mocks.listProxyHosts,
    isProxyHostEnabled: (h: any) => h.enabled === true || h.enabled === 1,
}))
vi.mock('../reconcile/diff', () => ({ computeFleetState: mocks.computeFleetState }))

const { dbMock } = await import('../../../test/fake-db')
const { listDomains } = await import('./list-domains')

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.computeFleetState.mockResolvedValue(new Map())
})

describe('listDomains', () => {
    it('cruza las filas de la DB con su estado en vivo', async () => {
        dbMock.queueSelect([
            {
                id: 'd1',
                hostname: 'app.negri.es',
                visibility: 'public',
                dnsOnly: false,
                source: 'manual',
                npmOptions: {},
                customLocations: [],
                advancedConfig: '',
                cfProxied: true,
                orphanedAt: null,
                forwardScheme: 'http',
                reconcileState: 'synced',
            },
        ])
        mocks.listProxyHosts.mockResolvedValue([
            {
                id: 9,
                domain_names: ['app.negri.es'],
                enabled: true,
                forward_scheme: 'http',
                forward_host: '10.0.0.5',
                forward_port: 8080,
            },
        ])
        mocks.computeFleetState.mockResolvedValue(new Map([['d1', { state: 'synced', npm: 'synced', dns: 'synced' }]]))

        const items = await listDomains()
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({
            id: 'd1',
            hostname: 'app.negri.es',
            npmProxyId: 9,
            npmState: 'synced',
            enabledInNpm: true,
        })
    })

    it('añade los proxy hosts de NPM sin fila como "unclassified"', async () => {
        dbMock.queueSelect([])
        mocks.listProxyHosts.mockResolvedValue([
            {
                id: 9,
                domain_names: ['huerfano.negri.es'],
                enabled: false,
                forward_scheme: 'http',
                forward_host: '1.2.3.4',
                forward_port: 80,
            },
        ])
        const items = await listDomains()
        expect(items).toHaveLength(1)
        expect(items[0]).toMatchObject({
            id: null,
            hostname: 'huerfano.negri.es',
            visibility: 'unclassified',
            enabledInNpm: false,
        })
    })
})

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
const { listStatus } = await import('./list-status')

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.listProxyHosts.mockResolvedValue([])
    mocks.computeFleetState.mockResolvedValue(new Map())
})

describe('listStatus', () => {
    it('devuelve el estado en vivo por dominio para el polling', async () => {
        dbMock.queueSelect([
            {
                id: 'd1',
                hostname: 'app.negri.es',
                visibility: 'public',
                reconcileState: 'drift',
                lastReconciledAt: new Date('2026-01-01T00:00:00Z'),
            },
        ])
        mocks.computeFleetState.mockResolvedValue(new Map([['d1', { state: 'synced', npm: 'synced', dns: 'synced' }]]))

        const status = await listStatus()
        expect(status[0]).toMatchObject({ id: 'd1', reconcileState: 'synced', npmState: 'synced', dnsState: 'synced' })
        expect(status[0].lastReconciledAt).toBe('2026-01-01T00:00:00.000Z')
    })

    it('usa el estado de la DB si no hay lectura en vivo', async () => {
        dbMock.queueSelect([
            { id: 'd1', hostname: 'a.negri.es', visibility: 'public', reconcileState: 'error', lastReconciledAt: null },
        ])
        const status = await listStatus()
        expect(status[0].reconcileState).toBe('error')
        expect(status[0].lastReconciledAt).toBeNull()
    })
})

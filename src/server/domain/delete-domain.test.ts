import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getDomainOrThrow: vi.fn(),
    deleteProxyHost: vi.fn(),
    deleteRecord: vi.fn(),
    deleteStaticDns: vi.fn(),
    cloudflareApiForDomain: vi.fn(),
    resolveMikrotik: vi.fn(),
    removeEdgeRuleInCf: vi.fn(),
}))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('./get-domain', () => ({ getDomainOrThrow: mocks.getDomainOrThrow }))
vi.mock('../providers/cloudflare', () => ({ deleteRecord: mocks.deleteRecord }))
vi.mock('../providers/mikrotik', () => ({ deleteStaticDns: mocks.deleteStaticDns }))
vi.mock('../providers/npm', () => ({ deleteProxyHost: mocks.deleteProxyHost }))
vi.mock('../settings/dns-providers', () => ({
    cloudflareApiForDomain: mocks.cloudflareApiForDomain,
    resolveMikrotik: mocks.resolveMikrotik,
}))
vi.mock('./edge-sync', () => ({ removeEdgeRuleInCf: mocks.removeEdgeRuleInCf }))

const { dbMock } = await import('../../../test/fake-db')
const { deleteDomain } = await import('./delete-domain')

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.cloudflareApiForDomain.mockResolvedValue({ token: 't', zoneId: 'z' })
    mocks.resolveMikrotik.mockResolvedValue({ npmInternalIp: '192.168.1.2' })
    mocks.deleteProxyHost.mockResolvedValue(true)
    mocks.deleteRecord.mockResolvedValue({ id: 'r1' })
})

describe('deleteDomain', () => {
    it('por defecto borra el proxy host y la fila, pero NO el DNS ni las reglas', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd1',
            visibility: 'public',
            npmProxyId: 42,
            cloudflareRecordId: 'r1',
        })
        await deleteDomain('d1')
        expect(mocks.deleteProxyHost).toHaveBeenCalledWith(42)
        expect(mocks.deleteRecord).not.toHaveBeenCalled()
        expect(dbMock.ops.some((o) => o.kind === 'delete')).toBe(true)
    })

    it('removeDns en público borra el registro CF y sus reglas de borde', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd1',
            visibility: 'public',
            npmProxyId: 42,
            cloudflareRecordId: 'r1',
        })
        dbMock.queueSelect([{ id: 'er1' }, { id: 'er2' }])
        await deleteDomain('d1', { removeDns: true })
        expect(mocks.deleteRecord).toHaveBeenCalledWith({ token: 't', zoneId: 'z' }, 'r1')
        expect(mocks.removeEdgeRuleInCf).toHaveBeenCalledTimes(2)
    })

    it('removeDns en privado borra la entrada del Mikrotik', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd1',
            visibility: 'private',
            npmProxyId: null,
            mikrotikDnsId: '*1',
        })
        await deleteDomain('d1', { removeDns: true })
        expect(mocks.deleteStaticDns).toHaveBeenCalledWith({ npmInternalIp: '192.168.1.2' }, '*1')
    })

    it('un fallo del proveedor no bloquea el borrado de la fila', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({ id: 'd1', visibility: 'public', npmProxyId: 42 })
        mocks.deleteProxyHost.mockRejectedValue(new Error('npm caído'))
        await deleteDomain('d1')
        expect(dbMock.ops.some((o) => o.kind === 'delete')).toBe(true)
    })
})

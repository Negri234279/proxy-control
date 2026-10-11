import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    getDomainOrThrow: vi.fn(),
    reconcileDomain: vi.fn(),
    deleteRecord: vi.fn(),
    deleteStaticDns: vi.fn(),
    deleteProxyHost: vi.fn(),
    cloudflareApiForDomain: vi.fn(),
    resolveMikrotik: vi.fn(),
    getCloudflareDefaults: vi.fn(),
}))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('./get-domain', () => ({ getDomainOrThrow: mocks.getDomainOrThrow }))
vi.mock('./reconcile-domain', () => ({ reconcileDomain: mocks.reconcileDomain }))
vi.mock('../providers/cloudflare', () => ({ deleteRecord: mocks.deleteRecord }))
vi.mock('../providers/mikrotik', () => ({ deleteStaticDns: mocks.deleteStaticDns }))
vi.mock('../providers/npm', () => ({ deleteProxyHost: mocks.deleteProxyHost }))
vi.mock('../settings/dns-providers', () => ({
    cloudflareApiForDomain: mocks.cloudflareApiForDomain,
    resolveMikrotik: mocks.resolveMikrotik,
    getCloudflareDefaults: mocks.getCloudflareDefaults,
    cloudflareDefaultContent: (type: string, d: any) => (type === 'CNAME' ? d.defaultCname : d.defaultPublicIp),
}))

const { dbMock } = await import('../../../test/fake-db')
const { updateDomain } = await import('./update-domain')

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.cloudflareApiForDomain.mockResolvedValue({ token: 't', zoneId: 'z' })
    mocks.resolveMikrotik.mockResolvedValue({ npmInternalIp: '192.168.1.2' })
    mocks.getCloudflareDefaults.mockResolvedValue({ defaultPublicIp: '203.0.113.1', defaultCname: null })
    mocks.reconcileDomain.mockImplementation(async (id: string) => ({ id, reconcileState: 'synced' }))
    mocks.deleteRecord.mockResolvedValue({ id: 'r1' })
    mocks.deleteStaticDns.mockResolvedValue(undefined)
    mocks.deleteProxyHost.mockResolvedValue(true)
})

describe('updateDomain — sin cambio de topología', () => {
    it('patch vacío devuelve el dominio actual sin tocar la DB', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({ id: 'd1', visibility: 'public', dnsOnly: false })
        const result = await updateDomain('d1', {})
        expect(result).toMatchObject({ id: 'd1' })
        expect(dbMock.ops).toHaveLength(0)
        expect(mocks.reconcileDomain).not.toHaveBeenCalled()
    })

    it('patch de campos aplica un UPDATE y NO reconcilia', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({ id: 'd1', visibility: 'public', dnsOnly: false })
        dbMock.queueReturning([{ id: 'd1', forwardPort: 9090 }])
        const result = await updateDomain('d1', { forwardPort: 9090 })
        expect(dbMock.ops.find((o) => o.kind === 'update')!.set).toEqual({ forwardPort: 9090 })
        expect(result).toMatchObject({ forwardPort: 9090 })
        expect(mocks.reconcileDomain).not.toHaveBeenCalled()
    })
})

describe('updateDomain — cambio de topología', () => {
    it('público→privado borra el registro CF y reconcilia', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd1',
            visibility: 'public',
            dnsOnly: false,
            cloudflareRecordId: 'r1',
            cfRecordType: 'A',
            npmProxyId: 5,
        })
        dbMock.queueReturning([{ id: 'd1' }])
        const result = await updateDomain('d1', { visibility: 'private' })
        expect(mocks.deleteRecord).toHaveBeenCalledWith({ token: 't', zoneId: 'z' }, 'r1')
        expect(mocks.reconcileDomain).toHaveBeenCalledWith('d1')
        expect(result).toMatchObject({ reconcileState: 'synced' })
    })

    it('activar dnsOnly borra el proxy host de NPM', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd1',
            visibility: 'public',
            dnsOnly: false,
            cfRecordType: 'A',
            npmProxyId: 7,
        })
        dbMock.queueReturning([{ id: 'd1' }])
        await updateDomain('d1', { dnsOnly: true })
        expect(mocks.deleteProxyHost).toHaveBeenCalledWith(7)
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../errors'

const mocks = vi.hoisted(() => ({
    getDomainOrThrow: vi.fn(),
    resolveCloudflare: vi.fn(),
    resolveMikrotik: vi.fn(),
    findRecord: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    listStaticDns: vi.fn(),
    createStaticDns: vi.fn(),
    updateStaticDns: vi.fn(),
    listProxyHosts: vi.fn(),
    createProxyHost: vi.fn(),
    updateProxyHost: vi.fn(),
    desiredCertificateId: vi.fn(),
    desiredCfRecord: vi.fn(),
    desiredProxyHostInput: vi.fn(),
    ensureEdgeRules: vi.fn(),
}))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('./get-domain', () => ({ getDomainOrThrow: mocks.getDomainOrThrow }))
vi.mock('../settings/dns-providers', () => ({
    resolveCloudflare: mocks.resolveCloudflare,
    resolveMikrotik: mocks.resolveMikrotik,
}))
vi.mock('../providers/cloudflare', () => ({
    findRecord: mocks.findRecord,
    createRecord: mocks.createRecord,
    updateRecord: mocks.updateRecord,
}))
vi.mock('../providers/mikrotik', () => ({
    listStaticDns: mocks.listStaticDns,
    createStaticDns: mocks.createStaticDns,
    updateStaticDns: mocks.updateStaticDns,
}))
vi.mock('../providers/npm', () => ({
    listProxyHosts: mocks.listProxyHosts,
    createProxyHost: mocks.createProxyHost,
    updateProxyHost: mocks.updateProxyHost,
}))
vi.mock('./desired', () => ({
    desiredCertificateId: mocks.desiredCertificateId,
    desiredCfRecord: mocks.desiredCfRecord,
    desiredProxyHostInput: mocks.desiredProxyHostInput,
}))
vi.mock('./edge-sync', () => ({ ensureEdgeRules: mocks.ensureEdgeRules }))
vi.mock('../observability/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('../observability/metrics', () => ({ reconcileCounter: { inc: vi.fn() } }))

const { dbMock } = await import('../../../test/fake-db')
const { reconcileDomain } = await import('./reconcile-domain')

const publicDomain = {
    id: 'd1',
    hostname: 'app.negri.es',
    visibility: 'public',
    dnsOnly: false,
    cfZoneId: null,
    cfRecordType: 'A',
    cfProxied: true,
}

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.resolveCloudflare.mockResolvedValue({
        token: 't',
        defaultZoneId: 'z',
        defaultPublicIp: '203.0.113.1',
        defaultCname: null,
    })
    mocks.resolveMikrotik.mockResolvedValue({ npmInternalIp: '192.168.1.2' })
    mocks.desiredCfRecord.mockReturnValue({ name: 'app.negri.es', type: 'A', content: '203.0.113.1', proxied: true })
    mocks.desiredCertificateId.mockResolvedValue('new')
    mocks.desiredProxyHostInput.mockReturnValue({ hostname: 'app.negri.es' })
    mocks.ensureEdgeRules.mockResolvedValue(undefined)
})

describe('reconcileDomain', () => {
    it('lanza si el dominio está sin clasificar', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({ id: 'd1', visibility: 'unclassified' })
        await expect(reconcileDomain('d1')).rejects.toBeInstanceOf(ValidationError)
        expect(dbMock.ops).toHaveLength(0)
    })

    it('público sin recursos: crea CF + NPM + reglas y guarda synced', async () => {
        mocks.getDomainOrThrow.mockResolvedValue(publicDomain)
        mocks.findRecord.mockResolvedValue(null)
        mocks.createRecord.mockResolvedValue({ id: 'rec1' })
        mocks.listProxyHosts.mockResolvedValue([])
        mocks.createProxyHost.mockResolvedValue({ id: 10, certificate_id: 0 })
        dbMock.queueReturning([{ id: 'd1', reconcileState: 'synced' }])

        const result = await reconcileDomain('d1')

        expect(mocks.createRecord).toHaveBeenCalled()
        expect(mocks.createProxyHost).toHaveBeenCalled()
        expect(mocks.ensureEdgeRules).toHaveBeenCalledWith(publicDomain)
        const update = dbMock.ops.find((o) => o.kind === 'update')!
        expect(update.set).toMatchObject({ reconcileState: 'synced', cloudflareRecordId: 'rec1' })
        expect(result).toMatchObject({ reconcileState: 'synced' })
    })

    it('si un proveedor falla, guarda error y re-lanza', async () => {
        mocks.getDomainOrThrow.mockResolvedValue(publicDomain)
        mocks.resolveCloudflare.mockRejectedValue(new Error('cf caído'))
        await expect(reconcileDomain('d1')).rejects.toThrow('cf caído')
        const update = dbMock.ops.find((o) => o.kind === 'update')!
        expect(update.set).toMatchObject({ reconcileState: 'error' })
    })

    it('privado solo-DNS: crea la entrada Mikrotik y NO toca NPM', async () => {
        mocks.getDomainOrThrow.mockResolvedValue({
            id: 'd2',
            hostname: 'nas.negri.es',
            visibility: 'private',
            dnsOnly: true,
            dnsTarget: '192.168.1.20',
        })
        mocks.listStaticDns.mockResolvedValue([])
        mocks.createStaticDns.mockResolvedValue({ '.id': '*5' })
        dbMock.queueReturning([{ id: 'd2', reconcileState: 'synced' }])

        await reconcileDomain('d2')
        expect(mocks.createStaticDns).toHaveBeenCalled()
        expect(mocks.listProxyHosts).not.toHaveBeenCalled()
        expect(mocks.ensureEdgeRules).toHaveBeenCalled()
    })
})

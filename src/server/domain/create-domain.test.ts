import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../errors'

const mocks = vi.hoisted(() => ({
    getCloudflareDefaults: vi.fn(),
    reconcileDomain: vi.fn(),
    writeDesiredEdgeRules: vi.fn(),
    getDomainOrThrow: vi.fn(),
}))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('../settings/dns-providers', () => ({
    getCloudflareDefaults: mocks.getCloudflareDefaults,
    cloudflareDefaultContent: (type: string, d: any) => (type === 'CNAME' ? d.defaultCname : d.defaultPublicIp),
}))
vi.mock('./reconcile-domain', () => ({ reconcileDomain: mocks.reconcileDomain }))
vi.mock('./edge-sync', () => ({ writeDesiredEdgeRules: mocks.writeDesiredEdgeRules }))
vi.mock('./get-domain', () => ({ getDomainOrThrow: mocks.getDomainOrThrow }))

const { dbMock } = await import('../../../test/fake-db')
const { createDomain } = await import('./create-domain')

const base = {
    hostname: 'app.negri.es',
    visibility: 'public',
    forwardScheme: 'http',
    forwardHost: '10.0.0.5',
    forwardPort: 8080,
} as const

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.getCloudflareDefaults.mockResolvedValue({ defaultPublicIp: '203.0.113.1', defaultCname: null })
    mocks.reconcileDomain.mockImplementation(async (id: string) => ({ id, reconcileState: 'synced' }))
})

describe('createDomain', () => {
    it('inserta el estado deseado y delega en la reconciliación', async () => {
        dbMock.queueReturning([{ id: 'new1', hostname: 'app.negri.es' }])
        const result = await createDomain({ ...base, cfContent: '9.9.9.9' })

        const insert = dbMock.ops.find((o) => o.kind === 'insert')!
        expect(insert.values).toMatchObject({ hostname: 'app.negri.es', visibility: 'public', cfContent: '9.9.9.9' })
        expect(mocks.reconcileDomain).toHaveBeenCalledWith('new1')
        expect(result).toMatchObject({ id: 'new1', reconcileState: 'synced' })
    })

    it('público A sin IP (ni default) → ValidationError, sin insertar', async () => {
        mocks.getCloudflareDefaults.mockResolvedValue({ defaultPublicIp: null, defaultCname: null })
        await expect(createDomain({ ...base })).rejects.toBeInstanceOf(ValidationError)
        expect(dbMock.ops).toHaveLength(0)
    })

    it('escribe las reglas edge deseadas antes de reconciliar', async () => {
        dbMock.queueReturning([{ id: 'new1' }])
        const edge = { waf: [{ description: 'd', expression: 'e', action: 'block' as const }], rateLimit: [] }
        await createDomain({ ...base, cfContent: '9.9.9.9', edge })
        expect(mocks.writeDesiredEdgeRules).toHaveBeenCalledWith('new1', edge)
    })

    it('hostname duplicado (23505) → ValidationError "ya existe"', async () => {
        dbMock.failNext({ code: '23505' })
        await expect(createDomain({ ...base, cfContent: '9.9.9.9' })).rejects.toThrow(/ya existe/i)
    })

    it('si la reconciliación falla, devuelve la fila recargada', async () => {
        dbMock.queueReturning([{ id: 'new1' }])
        mocks.reconcileDomain.mockRejectedValue(new Error('cf caído'))
        mocks.getDomainOrThrow.mockResolvedValue({ id: 'new1', reconcileState: 'error' })
        const result = await createDomain({ ...base, cfContent: '9.9.9.9' })
        expect(result).toMatchObject({ reconcileState: 'error' })
    })
})

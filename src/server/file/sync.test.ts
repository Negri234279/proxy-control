import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    createFromSpec: vi.fn(),
    updateFromSpec: vi.fn(),
    matches: vi.fn(),
    desiredFromSpec: vi.fn(),
    edgeRulesMatch: vi.fn(),
    getCloudflareDefaults: vi.fn(),
    readDomainFiles: vi.fn(),
}))

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})
vi.mock('../domain/spec-sync', () => ({
    createFromSpec: mocks.createFromSpec,
    updateFromSpec: mocks.updateFromSpec,
    matches: mocks.matches,
    desiredFromSpec: mocks.desiredFromSpec,
}))
vi.mock('../domain/edge-sync', () => ({ edgeRulesMatch: mocks.edgeRulesMatch }))
vi.mock('../settings/dns-providers', () => ({ getCloudflareDefaults: mocks.getCloudflareDefaults }))
vi.mock('./reader', () => ({ readDomainFiles: mocks.readDomainFiles }))
vi.mock('../observability/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { dbMock } = await import('../../../test/fake-db')
const { syncFromFile } = await import('./sync')

const fileWith = (hostname: string) => ({
    path: '/config/domains.d/panels.yaml',
    content: `domains:\n  - hostname: ${hostname}\n    visibility: public\n    forward: { scheme: http, host: 10.0.0.5, port: 8080 }\n`,
})

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.getCloudflareDefaults.mockResolvedValue({ defaultPublicIp: null, defaultCname: null })
    mocks.desiredFromSpec.mockReturnValue({})
    mocks.matches.mockReturnValue(false)
    mocks.edgeRulesMatch.mockResolvedValue(true)
})

describe('syncFromFile', () => {
    it('crea un dominio nuevo declarado en el YAML', async () => {
        mocks.readDomainFiles.mockResolvedValue([fileWith('app.negri.es')])
        dbMock.queueSelect([])
        const summary = await syncFromFile()
        expect(summary.created).toBe(1)
        expect(mocks.createFromSpec).toHaveBeenCalled()
    })

    it('omite un dominio de otra fuente', async () => {
        mocks.readDomainFiles.mockResolvedValue([fileWith('app.negri.es')])
        dbMock.queueSelect([{ hostname: 'app.negri.es', source: 'manual' }])
        const summary = await syncFromFile()
        expect(summary.skipped).toBe(1)
    })

    it('actualiza un dominio file cambiado', async () => {
        mocks.readDomainFiles.mockResolvedValue([fileWith('app.negri.es')])
        dbMock.queueSelect([
            {
                id: 'd1',
                hostname: 'app.negri.es',
                source: 'file',
                reconcileState: 'drift',
                orphanedAt: null,
                sourceRef: '/config/domains.d/panels.yaml',
            },
        ])
        const summary = await syncFromFile()
        expect(summary.updated).toBe(1)
        expect(mocks.updateFromSpec).toHaveBeenCalled()
    })

    it('marca huérfano un dominio file retirado del YAML', async () => {
        mocks.readDomainFiles.mockResolvedValue([fileWith('app.negri.es')])
        dbMock.queueSelect([
            { id: 'old', hostname: 'old.negri.es', source: 'file', orphanedAt: null },
            {
                id: 'd1',
                hostname: 'app.negri.es',
                source: 'file',
                reconcileState: 'synced',
                orphanedAt: null,
                sourceRef: '/config/domains.d/panels.yaml',
            },
        ])
        mocks.matches.mockReturnValue(true)
        const summary = await syncFromFile()
        expect(summary.orphaned).toBe(1)
    })

    it('reporta una entrada YAML inválida sin abortar el fichero', async () => {
        mocks.readDomainFiles.mockResolvedValue([
            { path: '/config/domains.d/bad.yaml', content: 'domains:\n  - hostname: bad\n    visibility: public\n' },
        ])
        dbMock.queueSelect([])
        const summary = await syncFromFile()
        // 'bad' no es hostname válido y falta forward → entra como error, no como created.
        expect(summary.created).toBe(0)
        expect(summary.errors.length).toBe(1)
    })
})

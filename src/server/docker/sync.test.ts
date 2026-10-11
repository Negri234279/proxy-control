import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    createFromSpec: vi.fn(),
    updateFromSpec: vi.fn(),
    matches: vi.fn(),
    desiredFromSpec: vi.fn(),
    edgeRulesMatch: vi.fn(),
    getCloudflareDefaults: vi.fn(),
    dockerHostsFromEnv: vi.fn(),
    enableLabel: vi.fn(),
    listContainers: vi.fn(),
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
vi.mock('./api', () => ({ dockerHostsFromEnv: mocks.dockerHostsFromEnv, enableLabel: mocks.enableLabel }))
vi.mock('../providers/docker', () => ({ listContainers: mocks.listContainers }))
vi.mock('../observability/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { dbMock } = await import('../../../test/fake-db')
const { syncFromDocker } = await import('./sync')

const container = (hostname: string, id = 'c1') => ({
    Id: id,
    Names: [`/${hostname}`],
    Labels: {
        'proxy-control.enable': 'true',
        'proxy-control.hostname': hostname,
        'proxy-control.visibility': 'public',
        'proxy-control.forward.host': '10.0.0.5',
        'proxy-control.forward.port': '8080',
    },
})

beforeEach(() => {
    dbMock.reset()
    vi.clearAllMocks()
    mocks.getCloudflareDefaults.mockResolvedValue({ defaultPublicIp: null, defaultCname: null })
    mocks.dockerHostsFromEnv.mockReturnValue([{ name: 'local', api: {} }])
    mocks.enableLabel.mockReturnValue('proxy-control.enable')
    mocks.desiredFromSpec.mockReturnValue({})
    mocks.matches.mockReturnValue(false)
    mocks.edgeRulesMatch.mockResolvedValue(true)
})

describe('syncFromDocker', () => {
    it('crea un dominio nuevo descubierto', async () => {
        mocks.listContainers.mockResolvedValue([container('app.negri.es')])
        dbMock.queueSelect([])
        const summary = await syncFromDocker()
        expect(summary.created).toBe(1)
        expect(mocks.createFromSpec).toHaveBeenCalled()
    })

    it('omite un dominio de otra fuente (manual)', async () => {
        mocks.listContainers.mockResolvedValue([container('app.negri.es')])
        dbMock.queueSelect([{ hostname: 'app.negri.es', source: 'manual' }])
        const summary = await syncFromDocker()
        expect(summary.skipped).toBe(1)
        expect(mocks.updateFromSpec).not.toHaveBeenCalled()
    })

    it('no toca un dominio docker ya sincronizado y sin cambios', async () => {
        mocks.listContainers.mockResolvedValue([container('app.negri.es')])
        mocks.matches.mockReturnValue(true)
        dbMock.queueSelect([
            {
                id: 'd1',
                hostname: 'app.negri.es',
                source: 'docker',
                reconcileState: 'synced',
                orphanedAt: null,
                dockerHost: 'local',
                dockerContainerId: 'c1',
            },
        ])
        const summary = await syncFromDocker()
        expect(summary.unchanged).toBe(1)
        expect(mocks.updateFromSpec).not.toHaveBeenCalled()
    })

    it('marca huérfano un dominio docker cuyo container desapareció', async () => {
        mocks.listContainers.mockResolvedValue([])
        dbMock.queueSelect([
            { id: 'old', hostname: 'old.negri.es', source: 'docker', orphanedAt: null, dockerHost: 'local' },
        ])
        const summary = await syncFromDocker()
        expect(summary.orphaned).toBe(1)
        const update = dbMock.ops.find((o) => o.kind === 'update')!
        expect(update.set.orphanedAt).toBeInstanceOf(Date)
    })

    it('un host inaccesible NO orfana sus dominios', async () => {
        mocks.listContainers.mockRejectedValue(new Error('daemon caído'))
        dbMock.queueSelect([
            { id: 'x', hostname: 'x.negri.es', source: 'docker', orphanedAt: null, dockerHost: 'local' },
        ])
        const summary = await syncFromDocker()
        expect(summary.orphaned).toBe(0)
        expect(summary.errors.length).toBe(1)
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'

const mocks = vi.hoisted(() => ({ cfJson: vi.fn() }))
vi.mock('./cloudflare-http', () => ({ cfJson: mocks.cfJson, CF_BASE: 'https://api.cloudflare.com/client/v4' }))

const { addRule, createZoneRuleset, deleteRule, EDGE_PHASES, getPhaseEntrypoint, updateRule } =
    await import('./cloudflare-rulesets')

const api = { token: 'tok', zoneId: 'z1' }

beforeEach(() => vi.clearAllMocks())

describe('EDGE_PHASES', () => {
    it('mapea tipos a fases de Cloudflare', () => {
        expect(EDGE_PHASES.waf).toBe('http_request_firewall_custom')
        expect(EDGE_PHASES.ratelimit).toBe('http_ratelimit')
    })
})

describe('getPhaseEntrypoint', () => {
    it('devuelve el entrypoint cuando existe', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'rs1', phase: EDGE_PHASES.waf, rules: [] })
        const result = await getPhaseEntrypoint(api, EDGE_PHASES.waf)
        expect(result?.id).toBe('rs1')
        expect(mocks.cfJson.mock.calls[0][1]).toBe(`/zones/z1/rulesets/phases/${EDGE_PHASES.waf}/entrypoint`)
    })

    it('404 → null (aún no hay entrypoint)', async () => {
        mocks.cfJson.mockRejectedValue(new ProviderError('cloudflare', 'no existe', { status: 404 }))
        await expect(getPhaseEntrypoint(api, EDGE_PHASES.waf)).resolves.toBeNull()
    })

    it('403 → error de permisos legible (Rulesets)', async () => {
        mocks.cfJson.mockRejectedValue(new ProviderError('cloudflare', 'forbidden', { status: 403 }))
        const error = await getPhaseEntrypoint(api, EDGE_PHASES.waf).catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.message).toMatch(/permiso de Rulesets/)
    })
})

describe('CRUD de reglas', () => {
    it('createZoneRuleset crea un ruleset de zona vacío', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'rs1', phase: EDGE_PHASES.ratelimit, rules: [] })
        await createZoneRuleset(api, EDGE_PHASES.ratelimit)
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/rulesets')
        expect(init.method).toBe('POST')
        const body = JSON.parse(init.body)
        expect(body).toMatchObject({ kind: 'zone', phase: EDGE_PHASES.ratelimit, rules: [] })
    })

    it('addRule hace POST a /rules', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'rs1', rules: [] })
        await addRule(api, 'rs1', { description: 'd', expression: 'e', action: 'block', enabled: true })
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/rulesets/rs1/rules')
        expect(init.method).toBe('POST')
    })

    it('updateRule hace PATCH a /rules/:id', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'rs1', rules: [] })
        await updateRule(api, 'rs1', 'rule1', { description: 'd', expression: 'e', action: 'block', enabled: true })
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/rulesets/rs1/rules/rule1')
        expect(init.method).toBe('PATCH')
    })

    it('deleteRule hace DELETE a /rules/:id', async () => {
        mocks.cfJson.mockResolvedValue(null)
        await deleteRule(api, 'rs1', 'rule1')
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/rulesets/rs1/rules/rule1')
        expect(init.method).toBe('DELETE')
    })

    it('un 403 en una mutación se traduce a error de permisos', async () => {
        mocks.cfJson.mockRejectedValue(new ProviderError('cloudflare', 'forbidden', { status: 403 }))
        await expect(
            addRule(api, 'rs1', { description: 'd', expression: 'e', action: 'block', enabled: true }),
        ).rejects.toThrow(/permiso de Rulesets/)
    })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Domain, EdgeRule } from '../db/schema'
import type { EdgeSpec } from '../validation/domain-spec'

// Fakes en memoria para la DB (edge_rules) y el cliente de Cloudflare Rulesets, declarados con
// vi.hoisted para poder referenciarlos desde las factorías de vi.mock (que se elevan).
const mocks = vi.hoisted(() => {
    const dbState: { rows: EdgeRule[]; captured: { type: string; payload: unknown }[] } = { rows: [], captured: [] }
    const cfStore: { rulesets: Map<string, any>; byPhase: Map<string, string>; seq: number } = {
        rulesets: new Map(),
        byPhase: new Map(),
        seq: 0,
    }
    const clone = (value: any) => (value ? JSON.parse(JSON.stringify(value)) : value)

    const getPhaseEntrypoint = vi.fn(async (_api: unknown, phase: string) => {
        const id = cfStore.byPhase.get(phase)
        return id ? clone(cfStore.rulesets.get(id)) : null
    })
    const createZoneRuleset = vi.fn(async (_api: unknown, phase: string) => {
        const id = `rs-${phase}`
        const ruleset = { id, phase, rules: [] as any[] }
        cfStore.rulesets.set(id, ruleset)
        cfStore.byPhase.set(phase, id)
        return clone(ruleset)
    })
    const addRule = vi.fn(async (_api: unknown, rulesetId: string, rule: any) => {
        const ruleset = cfStore.rulesets.get(rulesetId)
        ruleset.rules.push({ ...rule, id: `rule-${++cfStore.seq}` })
        return clone(ruleset)
    })
    const updateRule = vi.fn(async (_api: unknown, rulesetId: string, ruleId: string, rule: any) => {
        const ruleset = cfStore.rulesets.get(rulesetId)
        const index = ruleset.rules.findIndex((r: any) => r.id === ruleId)
        ruleset.rules[index] = { ...ruleset.rules[index], ...rule }
        return clone(ruleset)
    })
    const deleteRule = vi.fn(async (_api: unknown, rulesetId: string, ruleId: string) => {
        const ruleset = cfStore.rulesets.get(rulesetId)
        ruleset.rules = ruleset.rules.filter((r: any) => r.id !== ruleId)
    })

    return { dbState, cfStore, getPhaseEntrypoint, createZoneRuleset, addRule, updateRule, deleteRule }
})

vi.mock('../db/client', () => {
    const result = (rows: unknown) => {
        const promise: any = Promise.resolve(rows)
        promise.limit = () => Promise.resolve(rows)
        return promise
    }
    return {
        db: {
            select: () => ({ from: () => ({ where: () => result(mocks.dbState.rows) }) }),
            insert: () => ({
                values: (payload: unknown) => {
                    mocks.dbState.captured.push({ type: 'insert', payload })
                    return Promise.resolve()
                },
            }),
            update: () => ({
                set: (payload: unknown) => ({
                    where: () => {
                        mocks.dbState.captured.push({ type: 'update', payload })
                        return Promise.resolve()
                    },
                }),
            }),
            delete: () => ({
                where: () => {
                    mocks.dbState.captured.push({ type: 'delete', payload: null })
                    return Promise.resolve()
                },
            }),
        },
    }
})

vi.mock('../settings/dns-providers', () => ({
    cloudflareApiForDomain: vi.fn(async () => ({ token: 'tok', zoneId: 'zone-1' })),
}))

vi.mock('../providers/cloudflare-rulesets', () => ({
    EDGE_PHASES: { waf: 'http_request_firewall_custom', ratelimit: 'http_ratelimit' },
    getPhaseEntrypoint: mocks.getPhaseEntrypoint,
    createZoneRuleset: mocks.createZoneRuleset,
    addRule: mocks.addRule,
    updateRule: mocks.updateRule,
    deleteRule: mocks.deleteRule,
}))

const { edgeRulesMatch, ensureEdgeRules, scopeExpression, writeDesiredEdgeRules } = await import('./edge-sync')

const domain = (overrides: Partial<Domain> = {}): Domain =>
    ({ id: 'd1', hostname: 'app.negri.es', visibility: 'public', cfProxied: true, ...overrides }) as Domain

const wafRow = (overrides: Partial<EdgeRule> = {}): EdgeRule =>
    ({
        id: 'row-1',
        domainId: 'd1',
        kind: 'waf',
        description: 'solo POST',
        expression: 'http.request.method ne "POST"',
        action: 'block',
        config: {},
        rulesetId: null,
        ruleId: null,
        orphanedAt: null,
        reconcileState: 'missing',
        ...overrides,
    }) as EdgeRule

const wafSpec = (expression = 'http.request.method ne "POST"'): EdgeSpec => ({
    waf: [{ description: 'solo POST', expression, action: 'block' }],
    rateLimit: [],
})

beforeEach(() => {
    mocks.dbState.rows = []
    mocks.dbState.captured = []
    mocks.cfStore.rulesets.clear()
    mocks.cfStore.byPhase.clear()
    mocks.cfStore.seq = 0
    vi.clearAllMocks()
})

describe('scopeExpression', () => {
    it('acota la expresión al host', () => {
        expect(scopeExpression('app.negri.es', 'http.request.method ne "POST"')).toBe(
            '(http.host eq "app.negri.es") and (http.request.method ne "POST")',
        )
    })
})

describe('writeDesiredEdgeRules', () => {
    it('crea filas nuevas cuando no existen', async () => {
        mocks.dbState.rows = []
        await writeDesiredEdgeRules('d1', wafSpec())
        const inserts = mocks.dbState.captured.filter((c) => c.type === 'insert')
        expect(inserts).toHaveLength(1)
        expect(inserts[0].payload).toMatchObject({ kind: 'waf', description: 'solo POST' })
    })

    it('marca huérfana (sin borrar) una regla retirada de la declaración', async () => {
        mocks.dbState.rows = [wafRow({ reconcileState: 'synced', ruleId: 'rule-1' })]
        await writeDesiredEdgeRules('d1', { waf: [], rateLimit: [] })
        const update = mocks.dbState.captured.find((c) => c.type === 'update')
        expect((update?.payload as any).orphanedAt).toBeInstanceOf(Date)
        expect(mocks.dbState.captured.some((c) => c.type === 'delete')).toBe(false)
    })

    it('actualiza (y revive) una regla cuya expresión cambió', async () => {
        mocks.dbState.rows = [wafRow({ reconcileState: 'synced', ruleId: 'rule-1' })]
        await writeDesiredEdgeRules('d1', wafSpec('http.request.method ne "GET"'))
        const update = mocks.dbState.captured.find((c) => c.type === 'update')
        expect((update?.payload as any).expression).toBe('http.request.method ne "GET"')
        expect((update?.payload as any).orphanedAt).toBeNull()
    })
})

describe('edgeRulesMatch', () => {
    it('true cuando las reglas activas coinciden y están synced', async () => {
        mocks.dbState.rows = [wafRow({ reconcileState: 'synced', ruleId: 'rule-1' })]
        expect(await edgeRulesMatch('d1', wafSpec())).toBe(true)
    })

    it('false si cambia el número de reglas', async () => {
        mocks.dbState.rows = []
        expect(await edgeRulesMatch('d1', wafSpec())).toBe(false)
    })

    it('false si una regla aún no está reconciliada', async () => {
        mocks.dbState.rows = [wafRow({ reconcileState: 'missing' })]
        expect(await edgeRulesMatch('d1', wafSpec())).toBe(false)
    })

    it('ignora filas huérfanas al comparar el set deseado', async () => {
        mocks.dbState.rows = [wafRow({ orphanedAt: new Date(), reconcileState: 'synced' })]
        expect(await edgeRulesMatch('d1', { waf: [], rateLimit: [] })).toBe(true)
    })
})

describe('ensureEdgeRules — idempotencia', () => {
    it('crea → no-op en el segundo sync → update al cambiar la expresión', async () => {
        mocks.dbState.rows = [wafRow()]

        // 1) Primer sync: crea el entrypoint y añade la regla.
        await ensureEdgeRules(domain())
        expect(mocks.createZoneRuleset).toHaveBeenCalledTimes(1)
        expect(mocks.addRule).toHaveBeenCalledTimes(1)
        const synced = mocks.dbState.captured.find(
            (c) => c.type === 'update' && (c.payload as any).reconcileState === 'synced',
        )
        const assignedRuleId = (synced?.payload as any).ruleId
        expect(assignedRuleId).toBeTruthy()

        // Simula la persistencia del rule_id y del estado synced.
        mocks.dbState.rows[0].ruleId = assignedRuleId
        mocks.dbState.rows[0].reconcileState = 'synced'
        vi.clearAllMocks()
        mocks.dbState.captured = []

        // 2) Segundo sync sin cambios: NO re-crea ni re-escribe la regla.
        await ensureEdgeRules(domain())
        expect(mocks.addRule).not.toHaveBeenCalled()
        expect(mocks.updateRule).not.toHaveBeenCalled()

        // 3) Cambia la expresión deseada → drift → update (misma regla, no duplica).
        mocks.dbState.rows[0].expression = 'http.request.method ne "GET"'
        await ensureEdgeRules(domain())
        expect(mocks.addRule).not.toHaveBeenCalled()
        expect(mocks.updateRule).toHaveBeenCalledTimes(1)
    })

    it('no provisiona nada si el dominio no es público proxied', async () => {
        mocks.dbState.rows = [wafRow()]
        await ensureEdgeRules(domain({ cfProxied: false }))
        expect(mocks.getPhaseEntrypoint).not.toHaveBeenCalled()
        expect(mocks.addRule).not.toHaveBeenCalled()
    })

    it('reutiliza el entrypoint existente (no lo re-crea) al añadir una regla', async () => {
        mocks.dbState.rows = [wafRow()]
        // Precarga un entrypoint de la fase WAF ya existente en Cloudflare.
        mocks.cfStore.rulesets.set('rs-http_request_firewall_custom', {
            id: 'rs-http_request_firewall_custom',
            phase: 'http_request_firewall_custom',
            rules: [],
        })
        mocks.cfStore.byPhase.set('http_request_firewall_custom', 'rs-http_request_firewall_custom')

        await ensureEdgeRules(domain())
        expect(mocks.createZoneRuleset).not.toHaveBeenCalled()
        expect(mocks.addRule).toHaveBeenCalledTimes(1)
    })
})

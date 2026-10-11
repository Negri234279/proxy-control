import { describe, expect, it } from 'vitest'
import { edgeBlockSchema, edgeRateLimitEntrySchema, edgeWafEntrySchema } from './edge-rules'

describe('edgeWafEntrySchema', () => {
    it('acepta una regla WAF válida y aplica action=block por defecto', () => {
        const result = edgeWafEntrySchema.parse({
            description: 'bloquea X',
            expression: 'http.request.method ne "POST"',
        })
        expect(result.action).toBe('block')
    })

    it('rechaza claves desconocidas (strict)', () => {
        expect(() => edgeWafEntrySchema.parse({ description: 'd', expression: 'e', foo: 1 })).toThrow()
    })

    it('exige description y expression no vacías', () => {
        expect(() => edgeWafEntrySchema.parse({ description: '', expression: 'e' })).toThrow()
        expect(() => edgeWafEntrySchema.parse({ description: 'd', expression: '' })).toThrow()
    })

    it('rechaza una action distinta de block', () => {
        expect(() => edgeWafEntrySchema.parse({ description: 'd', expression: 'e', action: 'challenge' })).toThrow()
    })
})

describe('edgeRateLimitEntrySchema', () => {
    const base = {
        description: 'rl',
        expression: 'http.request.uri.path eq "/collect"',
        requestsPerPeriod: 100,
        period: 60,
        mitigationTimeout: 600,
    }

    it('acepta una regla válida y fuerza cf.colo.id en characteristics', () => {
        const result = edgeRateLimitEntrySchema.parse({ ...base, characteristics: ['ip.src'] })
        expect(result.characteristics).toContain('ip.src')
        expect(result.characteristics).toContain('cf.colo.id')
    })

    it('usa ip.src por defecto cuando no se declaran characteristics', () => {
        const result = edgeRateLimitEntrySchema.parse(base)
        expect(result.characteristics).toEqual(['ip.src', 'cf.colo.id'])
    })

    it('no duplica cf.colo.id si ya viene', () => {
        const result = edgeRateLimitEntrySchema.parse({ ...base, characteristics: ['cf.colo.id'] })
        expect(result.characteristics.filter((c) => c === 'cf.colo.id')).toHaveLength(1)
    })

    it('coacciona strings (labels de Docker) a número', () => {
        const result = edgeRateLimitEntrySchema.parse({
            ...base,
            requestsPerPeriod: '100',
            period: '60',
            mitigationTimeout: '600',
        })
        expect(result.requestsPerPeriod).toBe(100)
        expect(result.period).toBe(60)
    })

    it('rechaza un period fuera del set permitido', () => {
        expect(() => edgeRateLimitEntrySchema.parse({ ...base, period: 45 })).toThrow()
    })

    it('rechaza mitigationTimeout menor que period', () => {
        expect(() => edgeRateLimitEntrySchema.parse({ ...base, period: 600, mitigationTimeout: 60 })).toThrow()
    })
})

describe('edgeBlockSchema', () => {
    it('rellena waf/rateLimit vacías por defecto', () => {
        expect(edgeBlockSchema.parse({})).toEqual({ waf: [], rateLimit: [] })
    })

    it('rechaza claves desconocidas', () => {
        expect(() => edgeBlockSchema.parse({ waf: [], rateLimit: [], otra: true })).toThrow()
    })
})

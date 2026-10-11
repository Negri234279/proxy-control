import { describe, expect, it } from 'vitest'
import { dnsProviderLabel, stateMeta, VISIBILITY_LABEL } from './reconcile-state'

describe('stateMeta', () => {
    it('devuelve glifo + label + color por estado', () => {
        expect(stateMeta('synced')).toMatchObject({ label: 'OK', glyph: '●' })
        expect(stateMeta('drift').glyph).toBe('▲')
        expect(stateMeta('missing').glyph).toBe('✕')
        expect(stateMeta('error').glyph).toBe('⚠')
    })

    it('cae a "sin clasificar" con estado nulo o desconocido', () => {
        expect(stateMeta(null).label).toBe('Sin clasificar')
        expect(stateMeta(undefined).label).toBe('Sin clasificar')
        // @ts-expect-error estado inexistente a propósito
        expect(stateMeta('zzz').label).toBe('Sin clasificar')
    })

    it('todos los colores son variables CSS (no literales)', () => {
        for (const state of ['synced', 'drift', 'missing', 'error'] as const) {
            expect(stateMeta(state).color).toMatch(/^var\(--color-/)
        }
    })
})

describe('dnsProviderLabel', () => {
    it('mapea visibilidad a proveedor DNS', () => {
        expect(dnsProviderLabel('public')).toBe('Cloudflare')
        expect(dnsProviderLabel('private')).toBe('Mikrotik')
        expect(dnsProviderLabel('unclassified')).toBeNull()
    })
})

describe('VISIBILITY_LABEL', () => {
    it('etiqueta cada visibilidad', () => {
        expect(VISIBILITY_LABEL.public).toBe('Público')
        expect(VISIBILITY_LABEL.private).toBe('Privado')
        expect(VISIBILITY_LABEL.unclassified).toBe('Sin clasificar')
    })
})

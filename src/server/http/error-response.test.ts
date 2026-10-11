import { describe, expect, it } from 'vitest'
import { NotFoundError, ProviderError, ValidationError } from '../errors'
import { errorResponse, json, readJson, requireParam } from './error-response'

describe('errorResponse', () => {
    it('ValidationError → 400 con fields', async () => {
        const res = errorResponse(new ValidationError('malo', { hostname: 'requerido' }))
        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'malo', fields: { hostname: 'requerido' } })
    })

    it('NotFoundError → 404', () => {
        expect(errorResponse(new NotFoundError('no está')).status).toBe(404)
    })

    it('ProviderError → 502 con provider', async () => {
        const res = errorResponse(new ProviderError('cloudflare', 'cayó'))
        expect(res.status).toBe(502)
        await expect(res.json()).resolves.toMatchObject({ provider: 'cloudflare' })
    })

    it('error genérico → 500', () => {
        expect(errorResponse(new Error('boom')).status).toBe(500)
        expect(errorResponse('string suelto').status).toBe(500)
    })
})

describe('json', () => {
    it('serializa con status y content-type JSON', async () => {
        const res = json({ ok: true }, 201)
        expect(res.status).toBe(201)
        expect(res.headers.get('Content-Type')).toBe('application/json')
        await expect(res.json()).resolves.toEqual({ ok: true })
    })
})

describe('requireParam', () => {
    it('devuelve el valor presente', () => {
        expect(requireParam('abc')).toBe('abc')
    })

    it('lanza NotFoundError si falta', () => {
        expect(() => requireParam(undefined, 'ruleId')).toThrow(NotFoundError)
        expect(() => requireParam('')).toThrow(/id/)
    })
})

describe('readJson', () => {
    it('parsea un cuerpo JSON válido', async () => {
        const req = new Request('http://x/', { method: 'POST', body: JSON.stringify({ a: 1 }) })
        await expect(readJson(req)).resolves.toEqual({ a: 1 })
    })

    it('lanza ValidationError ante JSON inválido', async () => {
        const req = new Request('http://x/', { method: 'POST', body: '{roto' })
        await expect(readJson(req)).rejects.toBeInstanceOf(ValidationError)
    })
})

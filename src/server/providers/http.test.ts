import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'
import { fetchJson } from './http'

const mockFetch = (impl: () => Promise<any> | any) => vi.stubGlobal('fetch', vi.fn(impl))
const response = (status: number, body: string) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
})

afterEach(() => vi.unstubAllGlobals())

describe('fetchJson', () => {
    it('devuelve el JSON parseado en una respuesta 2xx', async () => {
        mockFetch(() => response(200, JSON.stringify({ a: 1 })))
        await expect(fetchJson('http://x/', { provider: 'npm' })).resolves.toEqual({ a: 1 })
    })

    it('respuesta vacía → undefined', async () => {
        mockFetch(() => response(200, ''))
        await expect(fetchJson('http://x/', { provider: 'npm' })).resolves.toBeUndefined()
    })

    it('status no-2xx → ProviderError con status y cuerpo', async () => {
        mockFetch(() => response(502, 'upstream caído'))
        const error: any = await fetchJson('http://x/', { provider: 'cloudflare' }).catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.status).toBe(502)
        expect(error.message).toMatch(/502/)
    })

    it('fallo de red → ProviderError "no se pudo contactar"', async () => {
        mockFetch(() => {
            throw new Error('ECONNREFUSED')
        })
        const error: any = await fetchJson('http://x/', { provider: 'mikrotik' }).catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.message).toMatch(/No se pudo contactar/)
    })

    it('cuerpo no-JSON en 2xx → ProviderError', async () => {
        mockFetch(() => response(200, '<html>nope'))
        await expect(fetchJson('http://x/', { provider: 'npm' })).rejects.toBeInstanceOf(ProviderError)
    })
})

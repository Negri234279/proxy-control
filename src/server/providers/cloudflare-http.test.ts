import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }))
vi.mock('./http', () => ({ fetchJson: mocks.fetchJson }))

const { cfJson, CF_BASE } = await import('./cloudflare-http')

beforeEach(() => vi.clearAllMocks())

describe('cfJson', () => {
    it('desenvuelve el result de un sobre success', async () => {
        mocks.fetchJson.mockResolvedValue({ success: true, errors: [], result: { id: 'z1' } })
        await expect(cfJson('tok', '/zones')).resolves.toEqual({ id: 'z1' })
    })

    it('añade Authorization Bearer y la base de la API', async () => {
        mocks.fetchJson.mockResolvedValue({ success: true, errors: [], result: null })
        await cfJson('secreto', '/zones/z1')
        const [url, init] = mocks.fetchJson.mock.calls[0]
        expect(url).toBe(`${CF_BASE}/zones/z1`)
        expect(init.headers.Authorization).toBe('Bearer secreto')
        expect(init.provider).toBe('cloudflare')
    })

    it('sobre !success → ProviderError con los códigos de error', async () => {
        mocks.fetchJson.mockResolvedValue({ success: false, errors: [{ code: 10000, message: 'auth' }], result: null })
        const error: any = await cfJson('tok', '/zones').catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.message).toMatch(/10000 auth/)
    })
})

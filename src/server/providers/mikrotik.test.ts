import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'
import type { HttpMockState } from '../../../test/http-request-fake'

const state = vi.hoisted(() => ({ scenario: { status: 200, body: '[]' }, calls: [], writes: [] }) as HttpMockState)

vi.mock('node:https', async () => {
    const { makeRequest } = await import('../../../test/http-request-fake')
    return { Agent: class {}, request: makeRequest(state) }
})

const { createStaticDns, deleteStaticDns, listStaticDns, updateStaticDns } = await import('./mikrotik')

const api = { baseUrl: 'https://mk.lan', user: 'admin', password: 'pw', tlsInsecure: true }

beforeEach(() => {
    state.scenario = { status: 200, body: '[]' }
    state.calls = []
    state.writes = []
})

const lastUrl = () => String(state.calls.at(-1)![0])
const lastOptions = () => state.calls.at(-1)![1] as { method: string }

describe('cliente Mikrotik', () => {
    it('listStaticDns hace GET a /rest/ip/dns/static', async () => {
        state.scenario = {
            status: 200,
            body: JSON.stringify([{ '.id': '*1', name: 'a.negri.es', address: '1.2.3.4' }]),
        }
        const entries = await listStaticDns(api)
        expect(entries[0].address).toBe('1.2.3.4')
        expect(lastUrl()).toMatch(/\/rest\/ip\/dns\/static$/)
        expect(lastOptions().method).toBe('GET')
    })

    it('createStaticDns hace PUT con type A y el body indicado', async () => {
        state.scenario = { status: 200, body: '{}' }
        await createStaticDns(api, { name: 'a.negri.es', address: '192.168.1.2' })
        expect(lastOptions().method).toBe('PUT')
        expect(JSON.parse(state.writes.at(-1)!)).toEqual({ name: 'a.negri.es', address: '192.168.1.2', type: 'A' })
    })

    it('updateStaticDns hace PATCH al id (url-encoded)', async () => {
        state.scenario = { status: 200, body: '{}' }
        await updateStaticDns(api, '*1A', '192.168.1.9')
        expect(lastOptions().method).toBe('PATCH')
        // encodeURIComponent('*1A') = '%2A1A', pero new URL() lo normaliza (* es char de path).
        expect(lastUrl().endsWith('/rest/ip/dns/static/*1A')).toBe(true)
        expect(JSON.parse(state.writes.at(-1)!)).toEqual({ address: '192.168.1.9' })
    })

    it('deleteStaticDns hace DELETE y tolera cuerpo vacío', async () => {
        state.scenario = { status: 204, body: '' }
        await expect(deleteStaticDns(api, '*1')).resolves.toBeUndefined()
        expect(lastOptions().method).toBe('DELETE')
    })

    it('status no-2xx → ProviderError con status', async () => {
        state.scenario = { status: 401, body: 'no auth' }
        const error = await listStaticDns(api).catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.status).toBe(401)
    })

    it('error de red → ProviderError "no se pudo contactar"', async () => {
        state.scenario = { error: Object.assign(new Error('x'), { code: 'ECONNREFUSED' }) }
        await expect(listStaticDns(api)).rejects.toThrow(/No se pudo contactar/)
    })
})

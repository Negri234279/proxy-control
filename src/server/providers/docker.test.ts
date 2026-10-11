import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderError } from '../errors'
import type { HttpMockState } from '../../../test/http-request-fake'

const state = vi.hoisted(() => ({ scenario: { status: 200, body: '[]' }, calls: [], writes: [] }) as HttpMockState)

vi.mock('node:http', async () => {
    const { makeRequest } = await import('../../../test/http-request-fake')
    return { request: makeRequest(state) }
})

const { listContainers, streamEvents } = await import('./docker')

const api = { socketPath: '/var/run/docker.sock' }

beforeEach(() => {
    state.scenario = { status: 200, body: '[]' }
    state.calls = []
    state.writes = []
})

const lastOptions = () => state.calls.at(-1)![0] as { path: string; method: string; socketPath?: string }

describe('listContainers', () => {
    it('pide /containers/json filtrando por el label de gate', async () => {
        state.scenario = { status: 200, body: JSON.stringify([{ Id: 'c1', Names: ['/app'], Labels: {} }]) }
        const containers = await listContainers(api, 'proxy-control.enable')
        expect(containers[0].Id).toBe('c1')
        const opts = lastOptions()
        expect(opts.path).toContain('/containers/json?')
        expect(decodeURIComponent(opts.path)).toContain('proxy-control.enable=true')
        expect(opts.socketPath).toBe('/var/run/docker.sock')
    })

    it('status no-2xx → ProviderError', async () => {
        state.scenario = { status: 500, body: 'boom' }
        const error = await listContainers(api, 'proxy-control.enable').catch((e) => e)
        expect(error).toBeInstanceOf(ProviderError)
        expect(error.status).toBe(500)
    })

    it('host tcp usa host/puerto', async () => {
        await listContainers({ host: '10.0.0.1', port: 2375 }, 'proxy-control.enable')
        expect(lastOptions()).toMatchObject({ host: '10.0.0.1', port: 2375 })
    })
})

describe('streamEvents', () => {
    it('invoca onEvent por cada línea JSON y resuelve al terminar', async () => {
        const line = (action: string) =>
            JSON.stringify({ Type: 'container', Action: action, Actor: { ID: 'x', Attributes: {} } })
        state.scenario = { status: 200, body: `${line('start')}\n${line('die')}\n` }

        const events: string[] = []
        await streamEvents(api, (event) => events.push(event.Action), new AbortController().signal)
        expect(events).toEqual(['start', 'die'])
    })

    it('status no-2xx → ProviderError', async () => {
        state.scenario = { status: 500, body: '' }
        await expect(streamEvents(api, () => {}, new AbortController().signal)).rejects.toBeInstanceOf(ProviderError)
    })
})

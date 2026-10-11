import { EventEmitter } from 'node:events'

// Fake de `request` de node:http/node:https para testear los clientes que no usan fetch
// (mikrotik, docker). Emula el ciclo req/res con EventEmitters: al llamar a `req.end()`
// invoca el callback con una respuesta que emite el cuerpo y termina (o emite un error).

export interface HttpScenario {
    status?: number
    body?: string | null
    error?: Error
}

export interface HttpMockState {
    scenario: HttpScenario
    calls: unknown[][]
    writes: string[]
}

export function makeRequest(state: HttpMockState) {
    return (...args: unknown[]) => {
        state.calls.push(args)
        const cb = args.find((arg): arg is (res: unknown) => void => typeof arg === 'function')

        const req = new EventEmitter() as EventEmitter & Record<string, unknown>
        req.write = (chunk: unknown) => {
            state.writes.push(String(chunk))
            return true
        }
        req.destroy = () => req
        req.setTimeout = () => req
        req.end = () => {
            const scenario = state.scenario
            if (scenario.error) {
                queueMicrotask(() => req.emit('error', scenario.error))
                return req
            }

            const res = new EventEmitter() as EventEmitter & Record<string, unknown>
            res.statusCode = scenario.status ?? 200
            res.setEncoding = () => res

            queueMicrotask(() => {
                cb?.(res)
                queueMicrotask(() => {
                    if (scenario.body != null) {
                        res.emit('data', Buffer.from(scenario.body))
                    }
                    res.emit('end')
                })
            })

            return req
        }

        return req
    }
}

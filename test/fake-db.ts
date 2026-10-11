// DB falsa en memoria para unit-testear la orquestación (create/update/delete/reconcile/sync)
// sin Postgres. Emula la superficie de drizzle usada por la app: select().from().where().limit(),
// insert().values().returning(), update().set().where().returning(), delete().where(). No
// interpreta las condiciones: el test programa los resultados (queueSelect/queueReturning) y
// consulta lo capturado (ops) y los pagos (set/values) para las aserciones.

export interface CapturedOp {
    kind: 'insert' | 'update' | 'delete'
    table: unknown
    set?: any
    values?: any
}

export interface FakeDb {
    db: any
    ops: CapturedOp[]
    queueSelect: (rows: unknown) => void
    queueReturning: (rows: unknown) => void
    failNext: (error: unknown) => void
    reset: () => void
}

export function makeFakeDb(): FakeDb {
    const selectQ: unknown[] = []
    const returningQ: unknown[] = []
    const ops: CapturedOp[] = []
    let nextError: unknown = null

    const settle = (value: unknown) => {
        if (nextError) {
            const error = nextError
            nextError = null
            return Promise.reject(error)
        }
        return Promise.resolve(value)
    }
    const shift = (queue: unknown[]) => (queue.length ? queue.shift() : [])

    const selectNode = () => {
        const node: any = {
            from: () => node,
            where: () => node,
            limit: () => node,
            then: (res: any, rej: any) => settle(shift(selectQ)).then(res, rej),
        }
        return node
    }

    const mutationNode = () => {
        const node: any = {
            returning: () => {
                node._ret = true
                return node
            },
            then: (res: any, rej: any) => settle(node._ret ? shift(returningQ) : undefined).then(res, rej),
        }
        return node
    }

    const db = {
        select: () => selectNode(),
        insert: (table: unknown) => ({
            values: (values: unknown) => {
                ops.push({ kind: 'insert', table, values })
                return mutationNode()
            },
        }),
        update: (table: unknown) => ({
            set: (set: unknown) => {
                ops.push({ kind: 'update', table, set })
                return { where: () => mutationNode() }
            },
        }),
        delete: (table: unknown) => ({
            where: () => {
                ops.push({ kind: 'delete', table })
                return settle(undefined)
            },
        }),
    }

    return {
        db,
        ops,
        queueSelect: (rows) => selectQ.push(rows),
        queueReturning: (rows) => returningQ.push(rows),
        failNext: (error) => {
            nextError = error
        },
        reset: () => {
            selectQ.length = 0
            returningQ.length = 0
            ops.length = 0
            nextError = null
        },
    }
}

// Singleton por grafo de módulo (vitest aísla módulos por fichero de test): la factoría de
// vi.mock('../db/client') y el test comparten esta misma instancia.
export const dbMock = makeFakeDb()

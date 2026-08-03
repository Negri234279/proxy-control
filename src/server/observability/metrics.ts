import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client'
import { db } from '../db/client'
import { domains } from '../db/schema'

// Registro Prometheus + métricas de negocio. Se expone en GET /metrics.
export const register = new Registry()
collectDefaultMetrics({ register })

const domainsGauge = new Gauge({
    name: 'proxy_control_domains',
    help: 'Número de dominios por estado de reconciliación',
    labelNames: ['state'],
    registers: [register],
})

export const reconcileCounter = new Counter({
    name: 'proxy_control_reconcile_total',
    help: 'Operaciones de reconciliación por resultado',
    labelNames: ['result'],
    registers: [register],
})

// Refresca el gauge de dominios desde la DB y devuelve el texto de exposición.
export async function collectMetrics(): Promise<string> {
    const rows = await db.select().from(domains)
    const counts = new Map<string, number>()

    for (const row of rows) {
        counts.set(row.reconcileState, (counts.get(row.reconcileState) ?? 0) + 1)
    }

    domainsGauge.reset()

    for (const [state, value] of counts) {
        domainsGauge.set({ state }, value)
    }

    return register.metrics()
}

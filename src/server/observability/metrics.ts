import { collectDefaultMetrics, Counter, Gauge, Registry } from 'prom-client'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { getDockerWatcherState } from '../docker/watcher'

// Registro Prometheus + métricas de negocio. Se expone en GET /metrics.
export const register = new Registry()
collectDefaultMetrics({ register })

const domainsGauge = new Gauge({
    name: 'proxy_control_domains',
    help: 'Número de dominios por estado de reconciliación',
    labelNames: ['state'],
    registers: [register],
})

// Estado por dominio (una serie por hostname): permite que las alertas nombren el
// dominio concreto en el mensaje. Cardinalidad ~1 por dominio.
const domainStateGauge = new Gauge({
    name: 'proxy_control_domain_reconcile_state',
    help: 'Estado de reconciliación actual de cada dominio (1 = estado vigente)',
    labelNames: ['hostname', 'state'],
    registers: [register],
})

export const reconcileCounter = new Counter({
    name: 'proxy_control_reconcile_total',
    help: 'Operaciones de reconciliación por resultado',
    labelNames: ['result'],
    registers: [register],
})

// Descubrimiento por Docker: dominios gestionados por labels, huérfanos y estado del worker.
const dockerDomainsGauge = new Gauge({
    name: 'proxy_control_docker_domains',
    help: 'Número de dominios gestionados por labels de Docker',
    registers: [register],
})

const dockerOrphansGauge = new Gauge({
    name: 'proxy_control_docker_orphans',
    help: 'Número de dominios docker huérfanos (container desaparecido)',
    registers: [register],
})

const dockerWatcherConnectedGauge = new Gauge({
    name: 'proxy_control_docker_watcher_connected',
    help: 'Stream de eventos de Docker conectado (1) o no (0)',
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

    // Docker: gestionados por labels, huérfanos y conexión del worker.
    dockerDomainsGauge.set(rows.filter((row) => row.source === 'docker').length)
    dockerOrphansGauge.set(rows.filter((row) => row.orphanedAt !== null).length)
    dockerWatcherConnectedGauge.set(getDockerWatcherState().connected ? 1 : 0)

    // Reset + set deja solo la serie del estado vigente de cada dominio; las de estados
    // anteriores desaparecen (p. ej. al pasar de 'error' a 'synced').
    domainStateGauge.reset()

    for (const row of rows) {
        domainStateGauge.set({ hostname: row.hostname, state: row.reconcileState }, 1)
    }

    return register.metrics()
}

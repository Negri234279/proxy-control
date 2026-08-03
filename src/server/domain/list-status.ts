import type { DomainStatusItem } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { listProxyHosts } from '../providers/npm'
import { computeFleetState } from '../reconcile/diff'

// Estado de sync de la flota para el POLLING de la tabla. Comprueba EN VIVO cada dominio
// clasificado (NPM + Cloudflare/Mikrotik) para reflejar cambios hechos fuera de la app
// (p. ej. borrar una entrada DNS a mano). `lastReconciledAt` sigue siendo el de la DB.

export async function listStatus(): Promise<DomainStatusItem[]> {
    const rowsPromise = db.select().from(domains)
    const hostsPromise = listProxyHosts()

    const [rows, hosts] = await Promise.all([rowsPromise, hostsPromise])
    const liveState = await computeFleetState(rows, hosts)

    return rows.map((row) => {
        const live = liveState.get(row.id)

        return {
            id: row.id,
            hostname: row.hostname,
            visibility: row.visibility,
            reconcileState: live?.state ?? row.reconcileState,
            npmState: live?.npm ?? row.reconcileState,
            dnsState: live?.dns ?? row.reconcileState,
            lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
        }
    })
}

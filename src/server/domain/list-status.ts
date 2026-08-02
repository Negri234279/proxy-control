import type { DomainStatusItem } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains } from '../db/schema'

// Estado de sync de la flota para el POLLING de la tabla: lectura SOLO de la DB (rápida).
// La reconciliación (botón) es quien recalcula y persiste el estado real; el polling se
// limita a reflejar lo almacenado.

export async function listStatus(): Promise<DomainStatusItem[]> {
    const rows = await db.select().from(domains)
    return rows.map((row) => ({
        id: row.id,
        hostname: row.hostname,
        visibility: row.visibility,
        reconcileState: row.reconcileState,
        lastReconciledAt: row.lastReconciledAt?.toISOString() ?? null,
    }))
}

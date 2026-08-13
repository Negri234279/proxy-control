import type { APIRoute } from 'astro'
import { count } from 'drizzle-orm'
import { db } from '../../server/db/client'
import { domains } from '../../server/db/schema'
import { json } from '../../server/http/error-response'

// Resumen para el widget `customapi` de Homepage. Consulta SOLO nuestra DB (un GROUP BY
// sobre reconcile_state), sin llamar a NPM/Cloudflare/Mikrotik: Homepage hace polling
// frecuente y este endpoint debe ser barato. Excluido del guard de auth (ver middleware).
export const GET: APIRoute = async () => {
    try {
        const rows = await db
            .select({ state: domains.reconcileState, n: count() })
            .from(domains)
            .groupBy(domains.reconcileState)

        const counts = { synced: 0, drift: 0, missing: 0, error: 0 }
        let total = 0
        
        for (const { state, n } of rows) {
            counts[state] = n
            total += n
        }

        return json({ status: 'ok', total, ...counts })
    } catch {
        return json({ status: 'degraded', total: 0, synced: 0, drift: 0, missing: 0, error: 0 }, 503)
    }
}

import type { APIRoute } from 'astro'
import { sql } from 'drizzle-orm'
import { db } from '../server/db/client'
import { json } from '../server/http/error-response'

// Readiness: comprueba que la DB responde. Excluido del guard de auth.
export const GET: APIRoute = async () => {
    try {
        await db.execute(sql`select 1`)

        return json({ status: 'ok', db: 'up' })
    } catch {
        return json({ status: 'degraded', db: 'down' }, 503)
    }
}

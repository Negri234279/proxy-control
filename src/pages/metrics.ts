import type { APIRoute } from 'astro'
import { collectMetrics, register } from '../server/observability/metrics'

// Exposición Prometheus. Excluido del guard de auth (lo scrapea el Prometheus de la app).
export const GET: APIRoute = async () => {
    const body = await collectMetrics()
    
    return new Response(body, { headers: { 'Content-Type': register.contentType } })
}

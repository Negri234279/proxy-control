import type { APIRoute } from 'astro'
import { NotFoundError, ProviderError, ValidationError } from '../errors'

// Mapeo centralizado de errores → respuesta HTTP JSON, y utilidades para las rutas.

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

export function errorResponse(error: unknown): Response {
    if (error instanceof ValidationError) {
        return json({ error: error.message, fields: error.fields }, 400)
    }
    if (error instanceof NotFoundError) {
        return json({ error: error.message }, 404)
    }
    if (error instanceof ProviderError) {
        return json({ error: error.message, provider: error.provider }, 502)
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return json({ error: message }, 500)
}

// Envuelve un handler de Astro para convertir cualquier throw en la respuesta adecuada.
export function route(handler: APIRoute): APIRoute {
    return async (context) => {
        try {
            return await handler(context)
        } catch (error) {
            return errorResponse(error)
        }
    }
}

export async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json()
    } catch {
        throw new ValidationError('Cuerpo JSON inválido')
    }
}

export function requireParam(value: string | undefined, name = 'id'): string {
    if (!value) {
        throw new NotFoundError(`Falta el parámetro ${name}`)
    }
    return value
}

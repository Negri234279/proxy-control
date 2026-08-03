import { defineMiddleware } from 'astro:middleware'
import { SESSION_COOKIE, verifySession } from './server/auth/session'
import { env } from './server/config/env'

// Guard de sesión. Con AUTH_ENABLED=false queda desactivado (uso solo-LAN). Deja pasar
// login, endpoints de observabilidad y los assets; el resto exige cookie válida.
const PUBLIC_PATHS = new Set(['/login', '/api/auth/login', '/health', '/metrics'])

export const onRequest = defineMiddleware((context, next) => {
    if (!env.AUTH_ENABLED) {
        return next()
    }

    const { pathname } = context.url
    if (PUBLIC_PATHS.has(pathname) || pathname.startsWith('/_') || pathname.startsWith('/favicon')) {
        return next()
    }

    if (verifySession(context.cookies.get(SESSION_COOKIE)?.value)) {
        return next()
    }

    if (pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    return context.redirect('/login')
})

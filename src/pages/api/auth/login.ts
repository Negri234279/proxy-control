import type { APIRoute } from 'astro'
import { verifyPassword } from '../../../server/auth/password'
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from '../../../server/auth/session'
import { env } from '../../../server/config/env'

// Login por formulario (form-encoded). Verifica usuario + hash Argon2 y fija la cookie
// de sesión firmada. Redirige a la home o de vuelta a /login con error.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
    const form = await request.formData()
    const user = String(form.get('user') ?? '')
    const password = String(form.get('password') ?? '')

    const ok =
        Boolean(env.AUTH_USER) &&
        Boolean(env.AUTH_PASSWORD_HASH) &&
        user === env.AUTH_USER &&
        (await verifyPassword(env.AUTH_PASSWORD_HASH as string, password))

    if (!ok) {
        return redirect('/login?error=1', 303)
    }

    cookies.set(SESSION_COOKIE, createSession(user), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_MAX_AGE,
        secure: env.NODE_ENV === 'production',
    })

    return redirect('/', 303)
}

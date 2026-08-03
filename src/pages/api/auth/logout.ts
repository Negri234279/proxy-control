import type { APIRoute } from 'astro'
import { SESSION_COOKIE } from '../../../server/auth/session'

export const POST: APIRoute = async ({ cookies, redirect }) => {
    cookies.delete(SESSION_COOKIE, { path: '/' })
    return redirect('/login', 303)
}

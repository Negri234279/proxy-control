import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'

// Sesión de un usuario mediante cookie firmada (HMAC-SHA256 con SESSION_SECRET). Sin
// estado en servidor: el token lleva el usuario y su expiración, firmados.

export const SESSION_COOKIE = 'pc_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 días (segundos)

function sign(payload: string): string {
    return createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)

    if (bufferA.length !== bufferB.length) {
        return false
    }

    return timingSafeEqual(bufferA, bufferB)
}

export function createSession(user: string): string {
    const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString(
        'base64url',
    )

    return `${payload}.${sign(payload)}`
}

export function verifySession(token: string | undefined): boolean {
    if (!token) {
        return false
    }

    const [payload, signature] = token.split('.')
    if (!payload || !signature) {
        return false
    }

    if (!safeEqual(signature, sign(payload))) {
        return false
    }
    
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number }
        return typeof data.exp === 'number' && data.exp > Date.now()
    } catch {
        return false
    }
}

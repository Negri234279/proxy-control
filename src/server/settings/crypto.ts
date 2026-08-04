import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../config/env'

// Cifrado de secretos de proveedores DNS para guardarlos en la DB. AES-256-GCM con clave
// derivada de SETTINGS_KEY (SHA-256 → 32 bytes). Formato: `v1:<iv>:<tag>:<cipher>` en base64.

const ALGORITHM = 'aes-256-gcm'
const KEY = createHash('sha256').update(env.SETTINGS_KEY).digest()

export function encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, KEY, iv)
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()

    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`
}

export function decrypt(payload: string): string {
    const [version, ivB64, tagB64, dataB64] = payload.split(':')
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
        throw new Error('Secreto con formato no soportado')
    }

    const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

export function encryptJson(value: unknown): string {
    return encrypt(JSON.stringify(value))
}

export function decryptJson<T>(payload: string): T {
    return JSON.parse(decrypt(payload)) as T
}

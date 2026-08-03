import { hash, verify } from '@node-rs/argon2'

// Hash/verificación de la contraseña del usuario con Argon2. El hash vive en
// AUTH_PASSWORD_HASH (env); nunca se guarda la contraseña en claro.

export function hashPassword(password: string): Promise<string> {
    return hash(password)
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
    try {
        return await verify(storedHash, password)
    } catch {
        return false
    }
}

import { hashPassword } from '../src/server/auth/password'

// Genera el hash Argon2 para AUTH_PASSWORD_HASH.
//   npm run auth:hash -- 'mi-contraseña'
const password = process.argv[2]

if (!password) {
    console.error("uso: npm run auth:hash -- '<password>'")
    process.exit(1)
}

console.log(await hashPassword(password))

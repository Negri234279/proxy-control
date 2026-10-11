// Entorno de test hermético. Se fija ANTES de que cualquier test importe módulos que validan
// `env` al cargarse (src/server/config/env.ts) o derivan la clave de cifrado (SETTINGS_KEY).
// Node no sobrescribe variables ya presentes al cargar un `.env`, así que estos valores ganan.

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
process.env.NPM_BASE_URL ??= 'http://npm.test'
process.env.NPM_EMAIL ??= 'test@test.local'
process.env.NPM_PASSWORD ??= 'test'
process.env.SESSION_SECRET ??= 'test-session-secret'
// Clave estable para que los round-trips de cifrado sean deterministas en los tests.
process.env.SETTINGS_KEY ??= 'test-settings-key-0123456789'
process.env.AUTH_ENABLED ??= 'false'

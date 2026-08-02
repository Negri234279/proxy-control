import { defineConfig } from 'drizzle-kit'

// drizzle-kit carga sus propias variables: intenta leer `.env` en local; en CI/prod el
// entorno ya viene inyectado. Solo necesita la URL de Postgres (no el resto de secretos).
try {
    process.loadEnvFile()
} catch {
    // Sin `.env`: se usan las variables ya presentes en el entorno.
}

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
    throw new Error('Falta DATABASE_URL (o MIGRATION_DATABASE_URL) para drizzle-kit')
}

export default defineConfig({
    schema: './src/server/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: { url },
    // Solo introspecciona/diffea nuestro esquema propio.
    schemaFilter: ['proxy_control'],
    verbose: true,
    strict: true,
})

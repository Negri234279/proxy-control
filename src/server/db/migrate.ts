import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

// Runner de migraciones. Se ejecuta con `npm run db:migrate` (tsx). En prod usa la
// conexión DIRECTA a Postgres (MIGRATION_DATABASE_URL), no PgBouncer: las migraciones
// necesitan comandos que el pooler en transaction mode no soporta bien.

try {
    process.loadEnvFile()
} catch {
    // Sin `.env`: se usan las variables ya presentes en el entorno.
}

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL

if (!url) {
    throw new Error('Falta DATABASE_URL (o MIGRATION_DATABASE_URL) para migrar')
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()

console.log('[db] migraciones aplicadas')

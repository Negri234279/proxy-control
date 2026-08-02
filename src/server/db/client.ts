import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env'
import * as schema from './schema'

// Pool de conexiones a Postgres. En prod la URL apunta a PgBouncer (transaction mode):
// node-postgres NO usa prepared statements con nombre por defecto, así que es compatible
// mientras no se asigne `name` a las queries. Drizzle cualifica las tablas por esquema
// (proxy_control.*), por lo que no dependemos del search_path del pooler.
export const pool = new Pool({ connectionString: env.DATABASE_URL })

export const db = drizzle(pool, { schema })

export type Db = typeof db

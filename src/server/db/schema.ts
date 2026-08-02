import { boolean, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { DEFAULT_NPM_OPTIONS, type CustomLocation, type NpmOptions } from '../../lib/domain-types'

// Esquema propio de la app. Al declararlo con pgSchema, Drizzle cualifica todas las
// tablas como `proxy_control.<tabla>`, así que las queries NO dependen del search_path
// (importante con PgBouncer en transaction mode).
export const proxyControl = pgSchema('proxy_control')

export const visibilityEnum = proxyControl.enum('visibility', ['public', 'private', 'unclassified'])
export const forwardSchemeEnum = proxyControl.enum('forward_scheme', ['http', 'https'])
export const sslModeEnum = proxyControl.enum('ssl_mode', ['new', 'wildcard'])
export const cfRecordTypeEnum = proxyControl.enum('cf_record_type', ['A', 'CNAME'])
export const reconcileStateEnum = proxyControl.enum('reconcile_state', ['synced', 'drift', 'missing', 'error'])

export const domains = proxyControl.table('domains', {
    id: uuid('id').primaryKey().defaultRandom(),
    hostname: text('hostname').notNull().unique(),
    visibility: visibilityEnum('visibility').notNull().default('unclassified'),

    // Destino que NPM proxifica.
    forwardScheme: forwardSchemeEnum('forward_scheme').notNull().default('http'),
    forwardHost: text('forward_host'),
    forwardPort: integer('forward_port'),

    // Opciones del proxy host de NPM (JSONB) + ubicaciones personalizadas.
    npmOptions: jsonb('npm_options').$type<NpmOptions>().notNull().default(DEFAULT_NPM_OPTIONS),
    customLocations: jsonb('custom_locations').$type<CustomLocation[]>().notNull().default([]),

    // Política SSL: public → 'new' (LE nuevo); private → 'wildcard' (*.negri.es, DNS-01).
    sslMode: sslModeEnum('ssl_mode'),
    certificateId: integer('certificate_id'),

    // Registro DNS público (solo public).
    cfRecordType: cfRecordTypeEnum('cf_record_type').notNull().default('A'),
    cfContent: text('cf_content'),
    cfProxied: boolean('cf_proxied').notNull().default(true),

    // Ids observados en cada proveedor.
    npmProxyId: integer('npm_proxy_id'),
    cloudflareRecordId: text('cloudflare_record_id'),
    mikrotikDnsId: text('mikrotik_dns_id'),

    // Estado de reconciliación.
    reconcileState: reconcileStateEnum('reconcile_state').notNull().default('missing'),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
})

export type Domain = typeof domains.$inferSelect
export type NewDomain = typeof domains.$inferInsert

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
export const dnsProviderScopeEnum = proxyControl.enum('dns_provider_scope', ['public', 'private'])
// Origen del dominio: alta manual (panel) o descubierto por labels de Docker.
export const domainSourceEnum = proxyControl.enum('domain_source', ['manual', 'docker'])

// Proveedores DNS configurables (editables por panel). Modelo genérico: `kind` decide el
// cliente (cloudflare, mikrotik, …), `scope` si resuelve dominios públicos o privados,
// `config` los ajustes no secretos y `secret` un JSON cifrado (AES-GCM) con las credenciales.
export const dnsProviders = proxyControl.table('dns_providers', {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    scope: dnsProviderScopeEnum('scope').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    secret: text('secret'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
})

export type DnsProvider = typeof dnsProviders.$inferSelect
export type NewDnsProvider = typeof dnsProviders.$inferInsert

export const domains = proxyControl.table('domains', {
    id: uuid('id').primaryKey().defaultRandom(),
    hostname: text('hostname').notNull().unique(),
    visibility: visibilityEnum('visibility').notNull().default('unclassified'),

    // Destino que NPM proxifica.
    forwardScheme: forwardSchemeEnum('forward_scheme').notNull().default('http'),
    forwardHost: text('forward_host'),
    forwardPort: integer('forward_port'),

    // Opciones del proxy host de NPM (JSONB) + ubicaciones personalizadas + config avanzada.
    npmOptions: jsonb('npm_options').$type<NpmOptions>().notNull().default(DEFAULT_NPM_OPTIONS),
    customLocations: jsonb('custom_locations').$type<CustomLocation[]>().notNull().default([]),
    advancedConfig: text('advanced_config').notNull().default(''),

    // Política SSL: public → 'new' (LE nuevo); private → 'wildcard' (*.domain.es, DNS-01).
    sslMode: sslModeEnum('ssl_mode'),
    certificateId: integer('certificate_id'),

    // Proveedor DNS que resuelve este dominio. Null → se usa el proveedor habilitado de su
    // scope (público/privado). FK con set null para no bloquear el borrado de un proveedor.
    dnsProviderId: uuid('dns_provider_id').references(() => dnsProviders.id, { onDelete: 'set null' }),

    // Registro DNS público (solo public).
    cfRecordType: cfRecordTypeEnum('cf_record_type').notNull().default('A'),
    cfContent: text('cf_content'),
    cfProxied: boolean('cf_proxied').notNull().default(true),
    // Zona de Cloudflare del registro (multizona). Null → zona por defecto del proveedor.
    cfZoneId: text('cf_zone_id'),
    cfZoneName: text('cf_zone_name'),

    // Ids observados en cada proveedor.
    npmProxyId: integer('npm_proxy_id'),
    cloudflareRecordId: text('cloudflare_record_id'),
    mikrotikDnsId: text('mikrotik_dns_id'),

    // Origen y trazabilidad de descubrimiento por Docker. `orphanedAt` marca un dominio
    // 'docker' cuyo container ya no existe (no se borra: se revisa/borra a mano).
    source: domainSourceEnum('source').notNull().default('manual'),
    dockerContainerId: text('docker_container_id'),
    orphanedAt: timestamp('orphaned_at', { withTimezone: true }),

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

import { and, eq } from 'drizzle-orm'
import type { CfRecordType } from '../../lib/domain-types'
import type { DnsProviderScope, DnsProviderView } from '../../lib/dns-providers'
import { env } from '../config/env'
import { db } from '../db/client'
import { dnsProviders, type DnsProvider, type Domain, type NewDnsProvider } from '../db/schema'
import { ProviderError, ValidationError } from '../errors'
import type { CloudflareApi } from '../providers/cloudflare'
import { decryptJson, encryptJson } from './crypto'

// Servicio de proveedores DNS: guarda su config (no-secreta en `config`, secretos cifrados
// en `secret`) y resuelve las credenciales de ejecución. Modelo genérico por `kind`/`scope`
// para poder añadir a futuro otros proveedores (públicos u otros privados como Pi-hole/AdGuard).

export type { DnsProviderScope }

export interface CloudflareConfig {
    defaultPublicIp: string | null
    // Host destino por defecto para registros CNAME (los A usan defaultPublicIp).
    defaultCname: string | null
    defaultZoneId: string | null
}

export interface CloudflareSecret {
    apiToken: string
}

export interface MikrotikConfig {
    baseUrl: string
    user: string
    tlsInsecure: boolean
    npmInternalIp: string
}

export interface MikrotikSecret {
    password: string
}

// Credenciales resueltas listas para el cliente.
export interface CloudflareRuntime {
    token: string
    defaultPublicIp: string | null
    defaultCname: string | null
    defaultZoneId: string | null
}

// Contenido por defecto de un registro según su tipo: CNAME → host destino; A → IP pública.
export function cloudflareDefaultContent(
    recordType: CfRecordType,
    defaults: { defaultPublicIp: string | null; defaultCname: string | null },
): string | null {
    return recordType === 'CNAME' ? defaults.defaultCname : defaults.defaultPublicIp
}

export interface MikrotikRuntime {
    baseUrl: string
    user: string
    password: string
    tlsInsecure: boolean
    npmInternalIp: string
}

// ── Seed idempotente desde el .env legacy (compat con despliegues previos) ──
let seeding: Promise<void> | null = null

export function ensureSeeded(): Promise<void> {
    if (!seeding) {
        seeding = seedFromEnv()
    }

    return seeding
}

async function seedFromEnv(): Promise<void> {
    const existing = await db.select({ scope: dnsProviders.scope }).from(dnsProviders)
    const scopes = new Set(existing.map((row) => row.scope))
    const rows: NewDnsProvider[] = []

    if (!scopes.has('public') && env.CLOUDFLARE_API_TOKEN) {
        rows.push({
            kind: 'cloudflare',
            scope: 'public',
            name: 'Cloudflare',
            config: {
                defaultPublicIp: env.PUBLIC_IP ?? null,
                defaultCname: null,
                defaultZoneId: env.CLOUDFLARE_ZONE_ID ?? null,
            } satisfies CloudflareConfig,
            secret: encryptJson({ apiToken: env.CLOUDFLARE_API_TOKEN } satisfies CloudflareSecret),
        })
    }

    if (!scopes.has('private') && env.MIKROTIK_BASE_URL && env.MIKROTIK_USER && env.MIKROTIK_PASSWORD) {
        rows.push({
            kind: 'mikrotik',
            scope: 'private',
            name: 'Mikrotik',
            config: {
                baseUrl: env.MIKROTIK_BASE_URL,
                user: env.MIKROTIK_USER,
                tlsInsecure: env.MIKROTIK_TLS_INSECURE,
                npmInternalIp: env.NPM_INTERNAL_IP ?? '',
            } satisfies MikrotikConfig,
            secret: encryptJson({ password: env.MIKROTIK_PASSWORD } satisfies MikrotikSecret),
        })
    }

    if (rows.length > 0) {
        await db.insert(dnsProviders).values(rows)
    }
}

// ── Lecturas ──

export async function listProviders(): Promise<DnsProvider[]> {
    await ensureSeeded()

    return db.select().from(dnsProviders)
}

export async function getProvider(id: string): Promise<DnsProvider | null> {
    await ensureSeeded()

    const [row] = await db.select().from(dnsProviders).where(eq(dnsProviders.id, id)).limit(1)

    return row ?? null
}

export async function getEnabledProvider(scope: DnsProviderScope): Promise<DnsProvider | null> {
    await ensureSeeded()
    const [row] = await db
        .select()
        .from(dnsProviders)
        .where(and(eq(dnsProviders.scope, scope), eq(dnsProviders.enabled, true)))
        .limit(1)

    return row ?? null
}

// ── Resolución de credenciales de ejecución ──

export async function resolveCloudflare(): Promise<CloudflareRuntime> {
    const provider = await getEnabledProvider('public')
    if (!provider || provider.kind !== 'cloudflare') {
        throw new ProviderError('cloudflare', 'No hay un proveedor DNS público (Cloudflare) configurado')
    }

    const config = provider.config as unknown as CloudflareConfig
    const secret = provider.secret ? decryptJson<CloudflareSecret>(provider.secret) : null
    if (!secret?.apiToken) {
        throw new ProviderError('cloudflare', 'El proveedor de Cloudflare no tiene token')
    }

    return {
        token: secret.apiToken,
        defaultPublicIp: config.defaultPublicIp ?? null,
        defaultCname: config.defaultCname ?? null,
        defaultZoneId: config.defaultZoneId ?? null,
    }
}

export async function resolveMikrotik(): Promise<MikrotikRuntime> {
    const provider = await getEnabledProvider('private')
    if (!provider || provider.kind !== 'mikrotik') {
        throw new ProviderError('mikrotik', 'No hay un proveedor DNS privado (Mikrotik) configurado')
    }

    const config = provider.config as unknown as MikrotikConfig
    const secret = provider.secret ? decryptJson<MikrotikSecret>(provider.secret) : null
    if (!config.baseUrl || !config.user || !secret?.password) {
        throw new ProviderError('mikrotik', 'El proveedor de Mikrotik está incompleto')
    }

    return {
        baseUrl: config.baseUrl,
        user: config.user,
        password: secret.password,
        tlsInsecure: config.tlsInsecure ?? false,
        npmInternalIp: config.npmInternalIp ?? '',
    }
}

// Config del cliente Cloudflare para un dominio concreto: zona explícita del dominio o, si
// no la tiene, la zona por defecto del proveedor. Lanza si no hay ninguna resoluble.
export async function cloudflareApiForDomain(domain: Domain): Promise<CloudflareApi> {
    const cf = await resolveCloudflare()
    const zoneId = domain.cfZoneId ?? cf.defaultZoneId
    if (!zoneId) {
        throw new ValidationError('Falta la zona de Cloudflare', { cfZoneId: 'requerido (elige una zona)' })
    }

    return {
        token: cf.token,
        zoneId,
    }
}

// Para mostrar (no lanza): IP pública por defecto del proveedor Cloudflare, o null.
export async function getCloudflareDefaultPublicIp(): Promise<string | null> {
    try {
        return (await resolveCloudflare()).defaultPublicIp
    } catch {
        return null
    }
}

// Defaults de contenido por tipo (no lanza): para derivar el cfContent al crear/editar.
export async function getCloudflareDefaults(): Promise<{
    defaultPublicIp: string | null
    defaultCname: string | null
}> {
    try {
        const cf = await resolveCloudflare()
        return { defaultPublicIp: cf.defaultPublicIp, defaultCname: cf.defaultCname }
    } catch {
        return { defaultPublicIp: null, defaultCname: null }
    }
}

// ── CRUD (panel) ──

export interface CreateProviderInput {
    kind: string
    scope: DnsProviderScope
    name: string
    config: Record<string, unknown>
    // Campos secretos en claro; se cifran aquí. Null/undefined = sin secreto.
    secret?: Record<string, unknown> | null
    enabled?: boolean
}

export async function createProvider(input: CreateProviderInput): Promise<DnsProvider> {
    await ensureSeeded()

    const [row] = await db
        .insert(dnsProviders)
        .values({
            kind: input.kind,
            scope: input.scope,
            name: input.name,
            config: input.config,
            secret: input.secret ? encryptJson(input.secret) : null,
            enabled: input.enabled ?? true,
        })
        .returning()

    return row
}

export interface UpdateProviderInput {
    name?: string
    config?: Record<string, unknown>
    // undefined = no tocar el secreto existente; un objeto = re-cifrar con los valores nuevos.
    secret?: Record<string, unknown>
    enabled?: boolean
}

export async function updateProvider(id: string, patch: UpdateProviderInput): Promise<DnsProvider | null> {
    const set: Partial<NewDnsProvider> = {}
    if (patch.name !== undefined) {
        set.name = patch.name
    }

    if (patch.config !== undefined) {
        set.config = patch.config
    }

    if (patch.enabled !== undefined) {
        set.enabled = patch.enabled
    }

    if (patch.secret !== undefined) {
        set.secret = encryptJson(patch.secret)
    }

    const [row] = await db.update(dnsProviders).set(set).where(eq(dnsProviders.id, id)).returning()
    return row ?? null
}

export async function deleteProvider(id: string): Promise<void> {
    await db.delete(dnsProviders).where(eq(dnsProviders.id, id))
}

// Vista para el panel: NUNCA expone el secreto (solo si está o no).
export function toProviderView(row: DnsProvider): DnsProviderView {
    return {
        id: row.id,
        kind: row.kind,
        scope: row.scope,
        name: row.name,
        config: row.config,
        hasSecret: Boolean(row.secret),
        enabled: row.enabled,
    }
}

export function decryptSecret<T>(row: DnsProvider): T | null {
    return row.secret ? decryptJson<T>(row.secret) : null
}

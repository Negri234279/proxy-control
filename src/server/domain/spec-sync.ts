import { eq } from 'drizzle-orm'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains, type Domain, type NewDomain } from '../db/schema'
import { cloudflareDefaultContent } from '../settings/dns-providers'
import type { DomainSpec } from '../validation/domain-spec'
import { createDomain } from './create-domain'
import { reconcileDomain } from './reconcile-domain'

// Motor compartido "spec → dominio" para las fuentes declarativas (Docker labels, fichero YAML).
// No decide qué specs procesar ni cómo detectar huérfanos (eso es de cada fuente): solo traduce
// una spec a la fila deseada, la compara con la existente y aplica el alta/actualización.

// Trazabilidad de la fuente: qué origen es y sus referencias (host/container de Docker, ruta
// del fichero de File). Se persiste en la fila para orfandad segura y para mostrarlo en la UI.
export interface SpecTrace {
    source: 'docker' | 'file'
    dockerHost: string | null
    dockerContainerId: string | null
    sourceRef: string | null
}

// Columnas del dominio que gobiernan las specs (para comparar y decidir si hay cambios).
export interface DesiredColumns {
    visibility: 'public' | 'private'
    dnsOnly: boolean
    dnsTarget: string | null
    forwardScheme: 'http' | 'https'
    forwardHost: string | null
    forwardPort: number | null
    npmOptions: NewDomain['npmOptions']
    customLocations: NewDomain['customLocations']
    advancedConfig: string
    certificateId: number | null
    cfRecordType: 'A' | 'CNAME'
    cfContent: string | null
    cfProxied: boolean
    cfZoneId: string | null
}

export function desiredFromSpec(
    spec: DomainSpec,
    cfDefaults: { defaultPublicIp: string | null; defaultCname: string | null },
): DesiredColumns {
    const isPublic = spec.visibility === 'public'
    const dnsOnly = spec.dnsOnly ?? false
    const cfRecordType = spec.cfRecordType ?? 'A'

    return {
        visibility: spec.visibility,
        dnsOnly,
        // El destino privado solo aplica a solo-DNS privado; en el resto es null.
        dnsTarget: dnsOnly && !isPublic ? (spec.dnsTarget ?? null) : null,
        forwardScheme: spec.forwardScheme,
        forwardHost: spec.forwardHost ?? null,
        forwardPort: spec.forwardPort ?? null,
        npmOptions: { ...DEFAULT_NPM_OPTIONS, ...(spec.npmOptions ?? {}) },
        customLocations: spec.customLocations ?? [],
        advancedConfig: spec.advancedConfig ?? '',
        certificateId: spec.certificateId ?? null,
        cfRecordType,
        cfContent: isPublic ? (spec.cfContent ?? cloudflareDefaultContent(cfRecordType, cfDefaults) ?? null) : null,
        cfProxied: spec.cfProxied ?? true,
        cfZoneId: isPublic ? (spec.cfZoneId ?? null) : null,
    }
}

// True si la fila ya coincide con lo que dice la spec (nada que aplicar en las columnas).
export function matches(row: Domain, desired: DesiredColumns): boolean {
    return (
        row.visibility === desired.visibility &&
        row.dnsOnly === desired.dnsOnly &&
        row.dnsTarget === desired.dnsTarget &&
        row.forwardScheme === desired.forwardScheme &&
        row.forwardHost === desired.forwardHost &&
        row.forwardPort === desired.forwardPort &&
        row.certificateId === desired.certificateId &&
        row.cfRecordType === desired.cfRecordType &&
        row.cfContent === desired.cfContent &&
        row.cfProxied === desired.cfProxied &&
        row.cfZoneId === desired.cfZoneId &&
        row.advancedConfig === desired.advancedConfig &&
        JSON.stringify(row.npmOptions) === JSON.stringify(desired.npmOptions) &&
        JSON.stringify(row.customLocations) === JSON.stringify(desired.customLocations)
    )
}

// Alta de un dominio nuevo desde una spec (delega en createDomain → reconciliación).
export function createFromSpec(spec: DomainSpec, desired: DesiredColumns, trace: SpecTrace): Promise<Domain> {
    return createDomain({
        hostname: spec.hostname,
        visibility: spec.visibility,
        dnsOnly: desired.dnsOnly,
        dnsTarget: desired.dnsTarget ?? undefined,
        forwardScheme: spec.forwardScheme,
        forwardHost: spec.forwardHost,
        forwardPort: spec.forwardPort,
        npmOptions: desired.npmOptions ?? undefined,
        customLocations: spec.customLocations,
        advancedConfig: spec.advancedConfig,
        certificateId: spec.certificateId,
        cfRecordType: spec.cfRecordType,
        cfContent: spec.cfContent,
        cfProxied: spec.cfProxied,
        cfZoneId: spec.cfZoneId,
        source: trace.source,
        dockerHost: trace.dockerHost ?? undefined,
        dockerContainerId: trace.dockerContainerId ?? undefined,
        sourceRef: trace.sourceRef ?? undefined,
    })
}

// Actualiza una fila existente para que coincida con la spec y la re-reconcilia. Al cambiar de
// tipo, limpia los ids del proveedor antiguo para no dejar basura.
export async function updateFromSpec(row: Domain, desired: DesiredColumns, trace: SpecTrace): Promise<void> {
    await db
        .update(domains)
        .set({
            visibility: desired.visibility,
            dnsOnly: desired.dnsOnly,
            dnsTarget: desired.dnsTarget,
            forwardScheme: desired.forwardScheme,
            forwardHost: desired.forwardHost,
            forwardPort: desired.forwardPort,
            npmOptions: desired.npmOptions,
            customLocations: desired.customLocations,
            advancedConfig: desired.advancedConfig,
            certificateId: desired.dnsOnly ? null : desired.certificateId,
            // Solo-DNS no toca NPM/SSL → sslMode null.
            sslMode: desired.dnsOnly
                ? null
                : desired.visibility === 'public' && !desired.certificateId
                  ? 'new'
                  : 'wildcard',
            cfRecordType: desired.cfRecordType,
            cfContent: desired.cfContent,
            cfProxied: desired.cfProxied,
            cfZoneId: desired.cfZoneId,
            cloudflareRecordId: row.visibility === desired.visibility ? row.cloudflareRecordId : null,
            mikrotikDnsId: row.visibility === desired.visibility ? row.mikrotikDnsId : null,
            source: trace.source,
            dockerHost: trace.dockerHost,
            dockerContainerId: trace.dockerContainerId,
            sourceRef: trace.sourceRef,
            orphanedAt: null,
            reconcileState: 'missing',
        })
        .where(eq(domains.id, row.id))

    await reconcileDomain(row.id)
}

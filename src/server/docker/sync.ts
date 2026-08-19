import { eq } from 'drizzle-orm'
import type { DockerSyncSummary } from '../../lib/docker'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains, type Domain, type NewDomain } from '../db/schema'
import { logger } from '../observability/logger'
import { listContainers } from '../providers/docker'
import { cloudflareDefaultContent, getCloudflareDefaults } from '../settings/dns-providers'
import { parseContainerLabels, type DockerDomainSpec } from '../validation/docker-labels'
import { env } from '../config/env'
import { createDomain } from '../domain/create-domain'
import { reconcileDomain } from '../domain/reconcile-domain'
import { dockerApiFromEnv, enableLabel } from './api'

// Sincroniza los dominios con las labels de los containers Docker. Idempotente: crea los
// nuevos, actualiza los cambiados, salta los que ya coinciden y NO toca los desacoplados
// (source='manual'). Marca huérfanos (sin borrar) los 'docker' cuyo container desapareció.

// Columnas del dominio que gobiernan las labels (para comparar y decidir si hay cambios).
interface DesiredColumns {
    visibility: 'public' | 'private'
    forwardScheme: 'http' | 'https'
    forwardHost: string
    forwardPort: number
    npmOptions: NewDomain['npmOptions']
    customLocations: NewDomain['customLocations']
    advancedConfig: string
    certificateId: number | null
    cfRecordType: 'A' | 'CNAME'
    cfContent: string | null
    cfProxied: boolean
    cfZoneId: string | null
}

function desiredFromSpec(
    spec: DockerDomainSpec,
    cfDefaults: { defaultPublicIp: string | null; defaultCname: string | null },
): DesiredColumns {
    const isPublic = spec.visibility === 'public'
    const cfRecordType = spec.cfRecordType ?? 'A'

    return {
        visibility: spec.visibility,
        forwardScheme: spec.forwardScheme,
        forwardHost: spec.forwardHost,
        forwardPort: spec.forwardPort,
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

// True si la fila ya coincide con lo que dicen las labels (nada que aplicar).
function matches(row: Domain, desired: DesiredColumns): boolean {
    return (
        row.visibility === desired.visibility &&
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

async function applyExisting(
    row: Domain,
    spec: DockerDomainSpec,
    containerId: string,
    desired: DesiredColumns,
): Promise<void> {
    await db
        .update(domains)
        .set({
            visibility: desired.visibility,
            forwardScheme: desired.forwardScheme,
            forwardHost: desired.forwardHost,
            forwardPort: desired.forwardPort,
            npmOptions: desired.npmOptions,
            customLocations: desired.customLocations,
            advancedConfig: desired.advancedConfig,
            certificateId: desired.certificateId,
            sslMode: desired.visibility === 'public' && !desired.certificateId ? 'new' : 'wildcard',
            cfRecordType: desired.cfRecordType,
            cfContent: desired.cfContent,
            cfProxied: desired.cfProxied,
            cfZoneId: desired.cfZoneId,
            // Si cambia el tipo, limpia los ids del proveedor antiguo para no dejar basura.
            cloudflareRecordId: row.visibility === desired.visibility ? row.cloudflareRecordId : null,
            mikrotikDnsId: row.visibility === desired.visibility ? row.mikrotikDnsId : null,
            source: 'docker',
            dockerContainerId: containerId,
            orphanedAt: null,
            reconcileState: 'missing',
        })
        .where(eq(domains.id, row.id))

    await reconcileDomain(row.id)
}

export async function syncFromDocker(): Promise<DockerSyncSummary> {
    const summary: DockerSyncSummary = { created: 0, updated: 0, skipped: 0, orphaned: 0, unchanged: 0, errors: [] }

    const api = dockerApiFromEnv()
    const containers = await listContainers(api, enableLabel())
    const cfDefaults = await getCloudflareDefaults()

    const [rows, seen] = [await db.select().from(domains), new Set<string>()]
    const byHostname = new Map(rows.map((row) => [row.hostname, row]))

    for (const container of containers) {
        let spec: DockerDomainSpec | null
        try {
            spec = parseContainerLabels(container.Labels ?? {}, env.DOCKER_LABEL_PREFIX)
        } catch (error) {
            const hostname = container.Labels?.[`${env.DOCKER_LABEL_PREFIX}.hostname`] ?? container.Names?.[0] ?? '?'
            summary.errors.push({ hostname, error: (error as Error).message })
            continue
        }

        if (!spec) continue
        seen.add(spec.hostname)

        const existing = byHostname.get(spec.hostname)
        const desired = desiredFromSpec(spec, cfDefaults)

        try {
            if (!existing) {
                await createDomain({
                    hostname: spec.hostname,
                    visibility: spec.visibility,
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
                    source: 'docker',
                    dockerContainerId: container.Id,
                })
                summary.created += 1
                continue
            }

            // Dominio desacoplado a mano (override): las labels no lo tocan.
            if (existing.source !== 'docker') {
                summary.skipped += 1
                continue
            }

            if (matches(existing, desired) && existing.reconcileState === 'synced' && !existing.orphanedAt) {
                // Ya coincide: solo refresca el id del container si cambió.
                if (existing.dockerContainerId !== container.Id) {
                    await db.update(domains).set({ dockerContainerId: container.Id }).where(eq(domains.id, existing.id))
                }
                summary.unchanged += 1
                continue
            }

            await applyExisting(existing, spec, container.Id, desired)
            summary.updated += 1
        } catch (error) {
            summary.errors.push({ hostname: spec.hostname, error: (error as Error).message })
        }
    }

    // Huérfanos: filas 'docker' cuyo hostname ya no aparece en ningún container. No se borran.
    for (const row of rows) {
        if (row.source !== 'docker' || seen.has(row.hostname) || row.orphanedAt) continue

        await db.update(domains).set({ orphanedAt: new Date() }).where(eq(domains.id, row.id))
        summary.orphaned += 1
    }

    logger.info('docker sync', { ...summary, errors: summary.errors.length })

    return summary
}

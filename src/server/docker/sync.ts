import { eq } from 'drizzle-orm'
import type { DockerSyncSummary } from '../../lib/docker'
import { env } from '../config/env'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { createFromSpec, desiredFromSpec, matches, updateFromSpec } from '../domain/spec-sync'
import { logger } from '../observability/logger'
import { listContainers, type DockerContainer } from '../providers/docker'
import { getCloudflareDefaults } from '../settings/dns-providers'
import { parseContainerLabels, type DockerDomainSpec } from '../validation/docker-labels'
import { dockerHostsFromEnv, enableLabel } from './api'

// Sincroniza los dominios con las labels de los containers Docker. Idempotente: crea los
// nuevos, actualiza los cambiados, salta los que ya coinciden y NO toca los desacoplados
// (source='manual'). Marca huérfanos (sin borrar) los 'docker' cuyo container desapareció.
// La traducción spec→dominio y la comparación viven en domain/spec-sync (compartidas con File).

// Un container descubierto junto al host del que proviene.
interface DiscoveredContainer {
    host: string
    container: DockerContainer
}

// Lista los containers de todos los hosts, con AISLAMIENTO por host: si un daemon falla,
// se registra el error y se OMITE de `reachable` (sus dominios no se marcarán huérfanos).
async function collectContainers(
    errors: DockerSyncSummary['errors'],
): Promise<{ discovered: DiscoveredContainer[]; reachable: Set<string>; total: number }> {
    const hosts = dockerHostsFromEnv()
    const discovered: DiscoveredContainer[] = []
    const reachable = new Set<string>()

    for (const host of hosts) {
        try {
            const containers = await listContainers(host.api, enableLabel())
            reachable.add(host.name)
            for (const container of containers) {
                discovered.push({ host: host.name, container })
            }
        } catch (error) {
            errors.push({ hostname: `[host ${host.name}]`, error: (error as Error).message })
            logger.warn('docker host unreachable, skipping', {
                host: host.name,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    return { discovered, reachable, total: hosts.length }
}

export async function syncFromDocker(): Promise<DockerSyncSummary> {
    const summary: DockerSyncSummary = { created: 0, updated: 0, skipped: 0, orphaned: 0, unchanged: 0, errors: [] }

    const { discovered, reachable, total } = await collectContainers(summary.errors)
    const cfDefaults = await getCloudflareDefaults()

    const [rows, seen] = [await db.select().from(domains), new Set<string>()]
    const byHostname = new Map(rows.map((row) => [row.hostname, row]))

    for (const { host, container } of discovered) {
        let spec: DockerDomainSpec | null
        try {
            spec = parseContainerLabels(container.Labels ?? {}, env.DOCKER_LABEL_PREFIX)
        } catch (error) {
            const hostname = container.Labels?.[`${env.DOCKER_LABEL_PREFIX}.hostname`] ?? container.Names?.[0] ?? '?'
            summary.errors.push({ hostname, error: (error as Error).message })
            continue
        }

        if (!spec) continue

        // Colisión de hostname entre hosts (o dos containers): gana el primero, el resto falla.
        if (seen.has(spec.hostname)) {
            summary.errors.push({
                hostname: spec.hostname,
                error: `hostname duplicado (también en host ${host}); se ignora la segunda declaración`,
            })
            continue
        }
        seen.add(spec.hostname)

        const existing = byHostname.get(spec.hostname)
        const desired = desiredFromSpec(spec, cfDefaults)
        const trace = { source: 'docker', dockerHost: host, dockerContainerId: container.Id, sourceRef: null } as const

        try {
            if (!existing) {
                await createFromSpec(spec, desired, trace)
                summary.created += 1
                continue
            }

            // Dominio desacoplado a mano o de otra fuente (override): no lo tocamos.
            if (existing.source !== 'docker') {
                summary.skipped += 1
                continue
            }

            if (
                matches(existing, desired) &&
                existing.reconcileState === 'synced' &&
                !existing.orphanedAt &&
                existing.dockerHost === host
            ) {
                // Ya coincide: solo refresca el id del container si cambió.
                if (existing.dockerContainerId !== container.Id) {
                    await db.update(domains).set({ dockerContainerId: container.Id }).where(eq(domains.id, existing.id))
                }
                summary.unchanged += 1
                continue
            }

            await updateFromSpec(existing, desired, trace)
            summary.updated += 1
        } catch (error) {
            summary.errors.push({ hostname: spec.hostname, error: (error as Error).message })
        }
    }

    // Huérfanos: filas 'docker' cuyo hostname ya no aparece en ningún container. No se borran.
    // Aislamiento por host: si el host de la fila NO fue accesible en esta pasada, no se toca
    // (evita falsos huérfanos por un daemon caído). Filas legacy sin `dockerHost` solo se
    // marcan si TODOS los hosts respondieron.
    const allReachable = reachable.size === total
    for (const row of rows) {
        if (row.source !== 'docker' || seen.has(row.hostname) || row.orphanedAt) continue

        const hostReachable = row.dockerHost ? reachable.has(row.dockerHost) : allReachable
        if (!hostReachable) continue

        await db.update(domains).set({ orphanedAt: new Date() }).where(eq(domains.id, row.id))
        summary.orphaned += 1
    }

    logger.info('docker sync', { ...summary, errors: summary.errors.length })

    return summary
}

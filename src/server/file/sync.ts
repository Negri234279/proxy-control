import { eq } from 'drizzle-orm'
import type { SyncSummary } from '../../lib/discovery'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { createFromSpec, desiredFromSpec, matches, updateFromSpec } from '../domain/spec-sync'
import { logger } from '../observability/logger'
import { getCloudflareDefaults } from '../settings/dns-providers'
import type { DomainSpec } from '../validation/domain-spec'
import { parseDomainsFile } from '../validation/file-domains'
import { readDomainFiles } from './reader'

// Sincroniza los dominios con los ficheros YAML de FILE_DOMAINS_PATH. Idempotente y con la
// misma semántica que Docker: crea los nuevos, actualiza los cambiados, salta los de otra
// fuente (override) y marca huérfanos (sin borrar) los 'file' cuya entrada desapareció.
//
// Seguridad: si no se puede LEER la ruta, se lanza (el watcher lo registra) y NO se orfana
// nada. Si se lee bien, una entrada retirada del YAML sí orfana su dominio.

interface DiscoveredSpec {
    spec: DomainSpec
    file: string
}

export async function syncFromFile(): Promise<SyncSummary> {
    const summary: SyncSummary = { created: 0, updated: 0, skipped: 0, orphaned: 0, unchanged: 0, errors: [] }

    const files = await readDomainFiles()
    const discovered: DiscoveredSpec[] = []

    for (const file of files) {
        const { specs, errors } = parseDomainsFile(file.content)
        for (const error of errors) {
            summary.errors.push({ hostname: `${file.path} · ${error.hostname}`, error: error.error })
        }
        for (const spec of specs) {
            discovered.push({ spec, file: file.path })
        }
    }

    const cfDefaults = await getCloudflareDefaults()
    const [rows, seen] = [await db.select().from(domains), new Set<string>()]
    const byHostname = new Map(rows.map((row) => [row.hostname, row]))

    for (const { spec, file } of discovered) {
        // Colisión de hostname entre ficheros/entradas: gana el primero, el resto falla.
        if (seen.has(spec.hostname)) {
            summary.errors.push({
                hostname: spec.hostname,
                error: `hostname duplicado (también en ${file}); se ignora la segunda declaración`,
            })
            continue
        }
        seen.add(spec.hostname)

        const existing = byHostname.get(spec.hostname)
        const desired = desiredFromSpec(spec, cfDefaults)
        const trace = { source: 'file', dockerHost: null, dockerContainerId: null, sourceRef: file } as const

        try {
            if (!existing) {
                await createFromSpec(spec, desired, trace)
                summary.created += 1
                continue
            }

            // Dominio manual o de otra fuente (override): los ficheros no lo tocan.
            if (existing.source !== 'file') {
                summary.skipped += 1
                continue
            }

            if (
                matches(existing, desired) &&
                existing.reconcileState === 'synced' &&
                !existing.orphanedAt &&
                existing.sourceRef === file
            ) {
                summary.unchanged += 1
                continue
            }

            await updateFromSpec(existing, desired, trace)
            summary.updated += 1
        } catch (error) {
            summary.errors.push({ hostname: spec.hostname, error: (error as Error).message })
        }
    }

    // Huérfanos: filas 'file' cuyo hostname ya no aparece en ningún fichero. No se borran.
    for (const row of rows) {
        if (row.source !== 'file' || seen.has(row.hostname) || row.orphanedAt) continue

        await db.update(domains).set({ orphanedAt: new Date() }).where(eq(domains.id, row.id))
        summary.orphaned += 1
    }

    logger.info('file sync', { ...summary, errors: summary.errors.length })

    return summary
}

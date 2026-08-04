import { eq } from 'drizzle-orm'
import type { ReconcileResultItem } from '../../lib/domain-types'
import { env } from '../config/env'
import { db } from '../db/client'
import { domains, type Domain, type NewDomain } from '../db/schema'
import { ValidationError } from '../errors'
import { createRecord, findRecord, updateRecord } from '../providers/cloudflare'
import { createStaticDns, listStaticDns, updateStaticDns } from '../providers/mikrotik'
import { reconcileCounter } from '../observability/metrics'
import { createProxyHost, listProxyHosts, updateProxyHost } from '../providers/npm'
import { desiredCertificateId, desiredCfRecord, desiredProxyHostInput } from './desired'
import { getDomainOrThrow } from './get-domain'

// Reconcilia un dominio: asegura que existan (y coincidan) sus recursos en cada
// proveedor, en orden DNS → NPM (el cert público se emite tras existir el DNS). Repara
// lo que falte o diverja. Deja `reconcile_state: 'error'` si algo falla.

async function ensurePublicDns(domain: Domain, updates: Partial<NewDomain>): Promise<void> {
    const desired = desiredCfRecord(domain)
    // Solo el registro del tipo gestionado (ignora un MX/otros que compartan hostname).
    const existing = await findRecord(domain.hostname, domain.cfRecordType)

    if (!existing) {
        const created = await createRecord(desired)
        updates.cloudflareRecordId = created.id

        return
    }

    const drift =
        existing.type !== desired.type || existing.content !== desired.content || existing.proxied !== desired.proxied
    if (drift) {
        await updateRecord(existing.id, desired)
    }

    updates.cloudflareRecordId = existing.id
}

async function ensurePrivateDns(domain: Domain, updates: Partial<NewDomain>): Promise<void> {
    const entries = await listStaticDns()
    const existing = entries.find((entry) => entry.name === domain.hostname)

    if (!existing) {
        const created = await createStaticDns({ name: domain.hostname, address: env.NPM_INTERNAL_IP })
        updates.mikrotikDnsId = created['.id']
        return
    }

    if (existing.address !== env.NPM_INTERNAL_IP) {
        await updateStaticDns(existing['.id'], env.NPM_INTERNAL_IP)
    }

    updates.mikrotikDnsId = existing['.id']
}

async function ensureNpm(domain: Domain, updates: Partial<NewDomain>): Promise<void> {
    const hosts = await listProxyHosts()
    const existing = hosts.find((host) => host.domain_names.includes(domain.hostname))

    let certificateId = await desiredCertificateId(domain)
    // Si íbamos a pedir 'new' pero el host ya tiene un cert válido, reutilízalo (no re-emitir).
    if (certificateId === 'new' && existing && existing.certificate_id > 0) {
        certificateId = existing.certificate_id
    }

    const input = desiredProxyHostInput(domain, certificateId)

    if (!existing) {
        const created = await createProxyHost(input)
        updates.npmProxyId = created.id
        // NPM NO aplica force_ssl/hsts/http2 en el insert mientras el cert no esté asignado
        // (con 'new' se asigna DESPUÉS). Con el cert ya real, re-aplicamos la config una vez.
        if (created.certificate_id > 0) {
            updates.certificateId = created.certificate_id
            await updateProxyHost(created.id, { ...input, certificateId: created.certificate_id })
        }
        return
    }

    const updated = await updateProxyHost(existing.id, input)
    updates.npmProxyId = updated.id
    if (updated.certificate_id > 0) {
        updates.certificateId = updated.certificate_id
        // Si el cert se acaba de asignar en este update (venía 'new'), re-aplica los flags SSL.
        if (certificateId === 'new') {
            await updateProxyHost(updated.id, { ...input, certificateId: updated.certificate_id })
        }
    }
}

export async function reconcileDomain(id: string): Promise<Domain> {
    const domain = await getDomainOrThrow(id)

    if (domain.visibility === 'unclassified') {
        throw new ValidationError('El dominio no está clasificado como público o privado', {
            visibility: 'clasifícalo antes de reconciliar',
        })
    }

    const updates: Partial<NewDomain> = {}

    try {
        // DNS primero: el certificado público se valida cuando el dominio ya resuelve.
        if (domain.visibility === 'public') {
            await ensurePublicDns(domain, updates)
        } else {
            await ensurePrivateDns(domain, updates)
        }

        await ensureNpm(domain, updates)

        const [saved] = await db
            .update(domains)
            .set({ ...updates, reconcileState: 'synced', lastReconciledAt: new Date() })
            .where(eq(domains.id, id))
            .returning()

        reconcileCounter.inc({ result: 'synced' })

        return saved
    } catch (error) {
        await db
            .update(domains)
            .set({ ...updates, reconcileState: 'error', lastReconciledAt: new Date() })
            .where(eq(domains.id, id))

        reconcileCounter.inc({ result: 'error' })

        throw error
    }
}

export async function reconcileAll(): Promise<ReconcileResultItem[]> {
    const rows = await db.select().from(domains)
    const results: ReconcileResultItem[] = []

    for (const row of rows) {
        if (row.visibility === 'unclassified') continue

        try {
            const saved = await reconcileDomain(row.id)
            results.push({ id: saved.id, hostname: saved.hostname, state: saved.reconcileState })
        } catch (error) {
            results.push({ id: row.id, hostname: row.hostname, state: 'error', error: (error as Error).message })
        }
    }

    return results
}

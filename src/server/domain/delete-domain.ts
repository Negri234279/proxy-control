import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { domains, edgeRules } from '../db/schema'
import { deleteRecord } from '../providers/cloudflare'
import { deleteStaticDns } from '../providers/mikrotik'
import { deleteProxyHost } from '../providers/npm'
import { cloudflareApiForDomain, resolveMikrotik } from '../settings/dns-providers'
import { removeEdgeRuleInCf } from './edge-sync'
import { getDomainOrThrow } from './get-domain'

interface DeleteOptions {
    // Si true, elimina también el registro DNS (Cloudflare o Mikrotik) del dominio.
    removeDns?: boolean
}

// Elimina un dominio. Borra el proxy host de NPM (best-effort) y, opcionalmente, su
// registro DNS asociado; luego borra la fila. Los fallos de proveedor no bloquean el
// borrado en DB (el recurso remoto puede reconciliarse/limpiarse aparte).
export async function deleteDomain(id: string, options: DeleteOptions = {}): Promise<void> {
    const domain = await getDomainOrThrow(id)

    if (domain.npmProxyId) {
        await deleteProxyHost(domain.npmProxyId).catch(() => undefined)
    }

    if (options.removeDns) {
        if (domain.visibility === 'public' && domain.cloudflareRecordId) {
            const recordId = domain.cloudflareRecordId
            await cloudflareApiForDomain(domain)
                .then((api) => deleteRecord(api, recordId))
                .catch(() => undefined)

            // Limpia también las reglas de borde provisionadas en Cloudflare (best-effort).
            const rules = await db.select().from(edgeRules).where(eq(edgeRules.domainId, domain.id))
            for (const rule of rules) {
                await removeEdgeRuleInCf(domain, rule)
            }
        }

        if (domain.visibility === 'private' && domain.mikrotikDnsId) {
            const dnsId = domain.mikrotikDnsId
            await resolveMikrotik()
                .then((mk) => deleteStaticDns(mk, dnsId))
                .catch(() => undefined)
        }
    }

    await db.delete(domains).where(eq(domains.id, id))
}

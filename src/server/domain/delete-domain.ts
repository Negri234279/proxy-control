import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { deleteRecord } from '../providers/cloudflare'
import { deleteStaticDns } from '../providers/mikrotik'
import { deleteProxyHost } from '../providers/npm'
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
            await deleteRecord(domain.cloudflareRecordId).catch(() => undefined)
        }
        if (domain.visibility === 'private' && domain.mikrotikDnsId) {
            await deleteStaticDns(domain.mikrotikDnsId).catch(() => undefined)
        }
    }

    await db.delete(domains).where(eq(domains.id, id))
}

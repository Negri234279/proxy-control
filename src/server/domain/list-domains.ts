import type { ForwardScheme, ReconcileState, Visibility } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { listProxyHosts } from '../providers/npm'

// Vista de la tabla: cruza los dominios de NPM con la metadata de la DB. Los hosts de
// NPM sin fila en la DB se devuelven como `unclassified`.

export interface DomainListItem {
    id: string | null // id de nuestra DB; null si está sin clasificar
    hostname: string
    visibility: Visibility
    forwardScheme: ForwardScheme | null
    forwardHost: string | null
    forwardPort: number | null
    reconcileState: ReconcileState | null
    npmProxyId: number | null
    enabledInNpm: boolean
}

export async function listDomains(): Promise<DomainListItem[]> {
    const [rows, hosts] = await Promise.all([db.select().from(domains), listProxyHosts()])

    const seen = new Set<string>()
    const items: DomainListItem[] = []

    for (const row of rows) {
        const host = hosts.find((candidate) => candidate.domain_names.includes(row.hostname))
        items.push({
            id: row.id,
            hostname: row.hostname,
            visibility: row.visibility,
            forwardScheme: row.forwardScheme,
            forwardHost: row.forwardHost,
            forwardPort: row.forwardPort,
            reconcileState: row.reconcileState,
            npmProxyId: host?.id ?? row.npmProxyId,
            enabledInNpm: host ? host.enabled === 1 : false,
        })
        seen.add(row.hostname)
    }

    for (const host of hosts) {
        for (const name of host.domain_names) {
            if (seen.has(name)) {
                continue
            }
            seen.add(name)
            items.push({
                id: null,
                hostname: name,
                visibility: 'unclassified',
                forwardScheme: host.forward_scheme as ForwardScheme,
                forwardHost: host.forward_host,
                forwardPort: host.forward_port,
                reconcileState: null,
                npmProxyId: host.id,
                enabledInNpm: host.enabled === 1,
            })
        }
    }

    return items
}

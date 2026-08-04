import type { DomainListItem, ForwardScheme } from '../../lib/domain-types'
import { db } from '../db/client'
import { domains } from '../db/schema'
import { isProxyHostEnabled, listProxyHosts } from '../providers/npm'
import { computeFleetState } from '../reconcile/diff'

// Vista de la tabla: cruza los dominios de NPM con la metadata de la DB, comprobando EN
// VIVO el estado real de cada dominio clasificado (NPM + Cloudflare/Mikrotik). Los hosts
// de NPM sin fila en la DB se devuelven como `unclassified`.

export async function listDomains(): Promise<DomainListItem[]> {
    const [rows, hosts] = await Promise.all([db.select().from(domains), listProxyHosts()])
    const liveState = await computeFleetState(rows, hosts)

    const seen = new Set<string>()
    const items: DomainListItem[] = []

    for (const row of rows) {
        const host = hosts.find((candidate) => candidate.domain_names.includes(row.hostname))
        const live = liveState.get(row.id)

        items.push({
            id: row.id,
            hostname: row.hostname,
            visibility: row.visibility,
            forwardScheme: row.forwardScheme,
            forwardHost: row.forwardHost,
            forwardPort: row.forwardPort,
            reconcileState: live?.state ?? row.reconcileState,
            npmState: live?.npm ?? null,
            dnsState: live?.dns ?? null,
            npmProxyId: host?.id ?? row.npmProxyId,
            enabledInNpm: host ? isProxyHostEnabled(host) : false,
            npmOptions: row.npmOptions,
            customLocations: row.customLocations,
            advancedConfig: row.advancedConfig,
            certificateId: row.certificateId,
            cfRecordType: row.cfRecordType,
            cfContent: row.cfContent,
            cfProxied: row.cfProxied,
        })

        seen.add(row.hostname)
    }

    for (const host of hosts) {
        for (const name of host.domain_names) {
            if (seen.has(name)) continue

            seen.add(name)

            items.push({
                id: null,
                hostname: name,
                visibility: 'unclassified',
                forwardScheme: host.forward_scheme as ForwardScheme,
                forwardHost: host.forward_host,
                forwardPort: host.forward_port,
                reconcileState: null,
                npmState: null,
                dnsState: null,
                npmProxyId: host.id,
                enabledInNpm: isProxyHostEnabled(host),
                npmOptions: null,
                customLocations: [],
                advancedConfig: '',
                certificateId: null,
                cfRecordType: null,
                cfContent: null,
                cfProxied: true,
            })
        }
    }

    return items
}

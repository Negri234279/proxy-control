import type { ReconcileState } from '../../lib/domain-types'
import { env } from '../config/env'
import type { Domain } from '../db/schema'
import { findRecord } from '../providers/cloudflare'
import { listStaticDns } from '../providers/mikrotik'
import { listProxyHosts, type NpmProxyHost } from '../providers/npm'

// Compara el estado deseado (fila `Domain`) con el real (NPM + Cloudflare/Mikrotik) y
// deriva el estado de reconciliación. No modifica nada: solo lee.

export interface ProviderCheck {
    present: boolean
    drift: boolean
    detail?: string
}

export interface DomainDiff {
    state: ReconcileState
    npm: ProviderCheck
    dns: ProviderCheck
    issues: string[]
}

const intBool = (value: number): boolean => value === 1

function npmDrift(domain: Domain, host: NpmProxyHost): string[] {
    const issues: string[] = []
    if (host.forward_scheme !== domain.forwardScheme) {
        issues.push('forward_scheme difiere')
    }
    if (host.forward_host !== domain.forwardHost) {
        issues.push('forward_host difiere')
    }
    if (host.forward_port !== domain.forwardPort) {
        issues.push('forward_port difiere')
    }
    if (intBool(host.block_exploits) !== domain.npmOptions.blockExploits) {
        issues.push('block_exploits difiere')
    }
    if (intBool(host.allow_websocket_upgrade) !== domain.npmOptions.websockets) {
        issues.push('websockets difiere')
    }
    if (intBool(host.caching_enabled) !== domain.npmOptions.cacheAssets) {
        issues.push('cache_assets difiere')
    }
    if (intBool(host.http2_support) !== domain.npmOptions.http2) {
        issues.push('http2 difiere')
    }
    if (intBool(host.hsts_enabled) !== domain.npmOptions.hsts) {
        issues.push('hsts difiere')
    }
    if (intBool(host.ssl_forced) !== domain.npmOptions.forceSsl) {
        issues.push('force_ssl difiere')
    }
    if (host.certificate_id === 0) {
        issues.push('sin certificado SSL')
    }
    return issues
}

async function checkNpm(domain: Domain): Promise<ProviderCheck> {
    const hosts = await listProxyHosts()
    const host = hosts.find((candidate) => candidate.domain_names.includes(domain.hostname))
    if (!host) {
        return { present: false, drift: false, detail: 'no existe el proxy host en NPM' }
    }
    const issues = npmDrift(domain, host)
    return { present: true, drift: issues.length > 0, detail: issues.join(', ') || undefined }
}

async function checkDns(domain: Domain): Promise<ProviderCheck> {
    if (domain.visibility === 'public') {
        const record = await findRecord(domain.hostname)
        if (!record) {
            return { present: false, drift: false, detail: 'no existe el registro en Cloudflare' }
        }
        const expectedContent = domain.cfContent ?? env.PUBLIC_IP
        const issues: string[] = []
        if (record.type !== domain.cfRecordType) {
            issues.push('tipo difiere')
        }
        if (expectedContent && record.content !== expectedContent) {
            issues.push('content difiere')
        }
        if (record.proxied !== domain.cfProxied) {
            issues.push('proxied difiere')
        }
        return { present: true, drift: issues.length > 0, detail: issues.join(', ') || undefined }
    }

    const entries = await listStaticDns()
    const entry = entries.find((candidate) => candidate.name === domain.hostname)
    if (!entry) {
        return { present: false, drift: false, detail: 'no existe la entrada DNS en el Mikrotik' }
    }
    const drift = entry.address !== env.NPM_INTERNAL_IP
    return { present: true, drift, detail: drift ? 'address difiere' : undefined }
}

export async function diff(domain: Domain): Promise<DomainDiff> {
    const issues: string[] = []

    let npm: ProviderCheck
    let dns: ProviderCheck
    let errored = false

    try {
        npm = await checkNpm(domain)
    } catch (error) {
        errored = true
        npm = { present: false, drift: false, detail: (error as Error).message }
        issues.push(`NPM: ${(error as Error).message}`)
    }

    try {
        dns = await checkDns(domain)
    } catch (error) {
        errored = true
        dns = { present: false, drift: false, detail: (error as Error).message }
        issues.push(`DNS: ${(error as Error).message}`)
    }

    if (npm.detail) {
        issues.push(`NPM: ${npm.detail}`)
    }
    if (dns.detail) {
        issues.push(`DNS: ${dns.detail}`)
    }

    const state = resolveState({ errored, npm, dns })
    return { state, npm, dns, issues }
}

function resolveState(input: { errored: boolean; npm: ProviderCheck; dns: ProviderCheck }): ReconcileState {
    if (input.errored) {
        return 'error'
    }
    if (!input.npm.present || !input.dns.present) {
        return 'missing'
    }
    if (input.npm.drift || input.dns.drift) {
        return 'drift'
    }
    return 'synced'
}

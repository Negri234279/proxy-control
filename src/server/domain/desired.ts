import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'
import type { Domain } from '../db/schema'
import { ValidationError } from '../errors'
import type { CreateRecordInput } from '../providers/cloudflare'
import type { CreateProxyHostInput } from '../providers/npm'
import { cloudflareDefaultContent } from '../settings/dns-providers'
import { resolveWildcardCertificateId } from './wildcard-certificate'

// Defaults de contenido del registro CF (IP para A, host para CNAME), de la config del proveedor.
export interface CloudflareDefaults {
    defaultPublicIp: string | null
    defaultCname: string | null
}

// Traduce una fila `Domain` (estado deseado en DB) a los inputs concretos de cada
// proveedor. Compartido por el alta y la reconciliación para no duplicar el mapeo.

// Prioridad: cert elegido explícitamente (columna certificate_id) > default por tipo.
// public sin elección → 'new' (cert nuevo de Let's Encrypt); private → wildcard (DNS-01).
export async function desiredCertificateId(domain: Domain): Promise<number | 'new'> {
    if (domain.certificateId) {
        return domain.certificateId
    }

    if (domain.visibility === 'public') {
        return 'new'
    }

    return resolveWildcardCertificateId(domain.hostname)
}

export function desiredProxyHostInput(domain: Domain, certificateId: number | 'new'): CreateProxyHostInput {
    if (!domain.forwardHost || domain.forwardPort === null) {
        throw new ValidationError('Faltan datos de upstream', {
            forwardHost: 'requerido',
            forwardPort: 'requerido',
        })
    }

    return {
        hostname: domain.hostname,
        forwardScheme: domain.forwardScheme,
        forwardHost: domain.forwardHost,
        forwardPort: domain.forwardPort,
        npmOptions: { ...DEFAULT_NPM_OPTIONS, ...(domain.npmOptions ?? {}) },
        customLocations: domain.customLocations ?? [],
        advancedConfig: domain.advancedConfig ?? '',
        certificateId,
        // Público: flujo estándar de NPM (sin DNS challenge). Privado: irrelevante (cert ya existe).
        dnsChallenge: false,
    }
}

// Los defaults vienen del proveedor Cloudflare (config en DB); se elige según el tipo de
// registro (A → IP pública, CNAME → host destino).
export function desiredCfContent(domain: Domain, defaults: CloudflareDefaults): string {
    const content = domain.cfContent ?? cloudflareDefaultContent(domain.cfRecordType, defaults)
    if (!content) {
        throw new ValidationError('Falta el contenido del registro DNS público', {
            cfContent: 'requerido (IP para A, host para CNAME)',
        })
    }

    return content
}

export function desiredCfRecord(domain: Domain, defaults: CloudflareDefaults): CreateRecordInput {
    return {
        name: domain.hostname,
        type: domain.cfRecordType,
        content: desiredCfContent(domain, defaults),
        proxied: domain.cfProxied,
    }
}

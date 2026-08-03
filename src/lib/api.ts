import type {
    CfRecordType,
    CustomLocation,
    DomainDiffView,
    DomainListItem,
    DomainStatusItem,
    ForwardScheme,
    NpmOptions,
    ReconcileResultItem,
    ReconcileState,
    Visibility,
} from './domain-types'

// Cliente de la API para el front. Same-origin; el navegador envía `Origin` (CSRF ok).

export interface ApiError extends Error {
    status: number
    fields?: Record<string, string>
}

// Subconjunto de la fila que devuelve el backend en create/reconcile/update.
export interface DomainRecord {
    id: string
    hostname: string
    visibility: Visibility
    forwardScheme: ForwardScheme
    forwardHost: string | null
    forwardPort: number | null
    reconcileState: ReconcileState
    npmProxyId: number | null
}

export interface NpmCertificateOption {
    id: number
    niceName: string
    domainNames: string[]
}

export interface CreateDomainBody {
    hostname: string
    visibility: 'public' | 'private'
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
    npmOptions?: NpmOptions
    customLocations?: CustomLocation[]
    advancedConfig?: string
    certificateId?: number | 'new'
    cfRecordType?: CfRecordType
    cfContent?: string
    cfProxied?: boolean
}

export interface UpdateDomainBody {
    forwardScheme?: ForwardScheme
    forwardHost?: string
    forwardPort?: number
    npmOptions?: NpmOptions
    customLocations?: CustomLocation[]
    advancedConfig?: string
    certificateId?: number | null
    cfRecordType?: CfRecordType
    cfContent?: string | null
    cfProxied?: boolean
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}

    if (!response.ok) {
        const error = new Error(data.error ?? `HTTP ${response.status}`) as ApiError
        error.status = response.status
        error.fields = data.fields
        throw error
    }

    return data as T
}

export const api = {
    listDomains: () => req<{ domains: DomainListItem[] }>('/api/domains').then((r) => r.domains),
    status: () => req<{ status: DomainStatusItem[] }>('/api/status').then((r) => r.status),
    domainStatus: (id: string) => req<{ status: DomainDiffView }>(`/api/domains/${id}/status`).then((r) => r.status),
    createDomain: (body: CreateDomainBody) =>
        req<{ domain: DomainRecord }>('/api/domains', { method: 'POST', body: JSON.stringify(body) }).then(
            (r) => r.domain,
        ),
    updateDomain: (id: string, body: UpdateDomainBody) =>
        req<{ domain: DomainRecord }>(`/api/domains/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then(
            (r) => r.domain,
        ),
    deleteDomain: (id: string, removeDns: boolean) =>
        req<{ ok: boolean }>(`/api/domains/${id}${removeDns ? '?removeDns=true' : ''}`, { method: 'DELETE' }),
    reconcileOne: (id: string) =>
        req<{ domain: DomainRecord }>(`/api/domains/${id}/reconcile`, { method: 'POST' }).then((r) => r.domain),
    reconcileAll: () =>
        req<{ results: ReconcileResultItem[] }>('/api/reconcile', { method: 'POST' }).then((r) => r.results),
    certificates: () =>
        req<{ certificates: NpmCertificateOption[] }>('/api/npm/certificates').then((r) => r.certificates),
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NPM_OPTIONS } from '../../lib/domain-types'

const mocks = vi.hoisted(() => ({ fetchJson: vi.fn() }))
vi.mock('./http', () => ({ fetchJson: mocks.fetchJson }))

const {
    createProxyHost,
    deleteProxyHost,
    isProxyHostEnabled,
    listCertificates,
    listProxyHosts,
    setProxyHostEnabled,
    updateProxyHost,
} = await import('./npm')

const isTokenCall = (call: any[]) => String(call[0]).endsWith('/api/tokens')
const lastApiCall = () => mocks.fetchJson.mock.calls.filter((c) => !isTokenCall(c)).at(-1)!

beforeEach(() => {
    mocks.fetchJson.mockImplementation(async (url: string) => {
        if (String(url).endsWith('/api/tokens')) {
            return { token: 't', expires: new Date(Date.now() + 3_600_000).toISOString() }
        }
        return []
    })
    mocks.fetchJson.mockClear()
})

describe('isProxyHostEnabled', () => {
    it('normaliza boolean y 0/1', () => {
        expect(isProxyHostEnabled({ enabled: true } as any)).toBe(true)
        expect(isProxyHostEnabled({ enabled: 1 } as any)).toBe(true)
        expect(isProxyHostEnabled({ enabled: false } as any)).toBe(false)
        expect(isProxyHostEnabled({ enabled: 0 } as any)).toBe(false)
    })
})

describe('autenticación', () => {
    it('cachea el token: dos llamadas, un solo POST /api/tokens', async () => {
        await listProxyHosts()
        await listProxyHosts()
        const tokenCalls = mocks.fetchJson.mock.calls.filter(isTokenCall)
        expect(tokenCalls.length).toBe(1)
    })

    it('adjunta Authorization Bearer con el token', async () => {
        await listProxyHosts()
        expect(lastApiCall()[1].headers.Authorization).toBe('Bearer t')
    })
})

describe('endpoints', () => {
    it('listProxyHosts / listCertificates usan sus rutas', async () => {
        await listProxyHosts()
        expect(lastApiCall()[0]).toMatch(/\/api\/nginx\/proxy-hosts$/)
        await listCertificates()
        expect(lastApiCall()[0]).toMatch(/\/api\/nginx\/certificates$/)
    })

    it('createProxyHost: body con flags mapeados y cert nuevo (letsencrypt_agree)', async () => {
        mocks.fetchJson.mockImplementation(async (url: string) => {
            if (String(url).endsWith('/api/tokens'))
                return { token: 't', expires: new Date(Date.now() + 3_600_000).toISOString() }
            return { id: 10, certificate_id: 0 }
        })
        await createProxyHost({
            hostname: 'app.negri.es',
            forwardScheme: 'http',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
            npmOptions: DEFAULT_NPM_OPTIONS,
            customLocations: [],
            advancedConfig: '',
            certificateId: 'new',
            dnsChallenge: false,
        })
        const [url, init] = lastApiCall()
        expect(url).toMatch(/\/api\/nginx\/proxy-hosts$/)
        expect(init.method).toBe('POST')
        const body = JSON.parse(init.body)
        expect(body).toMatchObject({
            domain_names: ['app.negri.es'],
            forward_host: '10.0.0.5',
            forward_port: 8080,
            certificate_id: 'new',
            ssl_forced: true,
            block_exploits: true,
            allow_websocket_upgrade: false,
        })
        expect(body.meta).toEqual({ letsencrypt_agree: true, dns_challenge: false })
    })

    it('updateProxyHost hace PUT a /:id', async () => {
        mocks.fetchJson.mockImplementation(async (url: string) => {
            if (String(url).endsWith('/api/tokens'))
                return { token: 't', expires: new Date(Date.now() + 3_600_000).toISOString() }
            return { id: 10, certificate_id: 5 }
        })
        await updateProxyHost(10, {
            hostname: 'app.negri.es',
            forwardScheme: 'http',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
            npmOptions: DEFAULT_NPM_OPTIONS,
            customLocations: [],
            advancedConfig: '',
            certificateId: 5,
            dnsChallenge: false,
        })
        const [url, init] = lastApiCall()
        expect(url).toMatch(/\/api\/nginx\/proxy-hosts\/10$/)
        expect(init.method).toBe('PUT')
    })

    it('deleteProxyHost hace DELETE; setProxyHostEnabled usa enable/disable', async () => {
        await deleteProxyHost(10)
        expect(lastApiCall()[1].method).toBe('DELETE')
        expect(lastApiCall()[0]).toMatch(/\/api\/nginx\/proxy-hosts\/10$/)

        await setProxyHostEnabled(10, true)
        expect(lastApiCall()[0]).toMatch(/\/api\/nginx\/proxy-hosts\/10\/enable$/)
        await setProxyHostEnabled(10, false)
        expect(lastApiCall()[0]).toMatch(/\/api\/nginx\/proxy-hosts\/10\/disable$/)
    })
})

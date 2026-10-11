import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    listCertificates: vi.fn(),
}))

vi.mock('../providers/npm', () => ({
    listCertificates: mocks.listCertificates,
}))

const { findCertificateIdForHostname, resolveWildcardCertificateId } = await import('./wildcard-certificate')

const cert = (id: number, domainNames: string[]) => ({
    id,
    provider: 'letsencrypt',
    nice_name: '',
    domain_names: domainNames,
})

beforeEach(() => {
    vi.clearAllMocks()
})

describe('findCertificateIdForHostname', () => {
    it('casa por nombre exacto', async () => {
        mocks.listCertificates.mockResolvedValue([cert(1, ['exacto.negri.es'])])
        expect(await findCertificateIdForHostname('exacto.negri.es')).toBe(1)
    })

    it('casa por wildcard *.base', async () => {
        mocks.listCertificates.mockResolvedValue([cert(2, ['*.negri.es'])])
        expect(await findCertificateIdForHostname('app.negri.es')).toBe(2)
    })

    it('casa por el dominio base', async () => {
        mocks.listCertificates.mockResolvedValue([cert(3, ['negri.es'])])
        expect(await findCertificateIdForHostname('app.negri.es')).toBe(3)
    })

    it('null si ningún certificado cubre el hostname', async () => {
        mocks.listCertificates.mockResolvedValue([cert(9, ['otra.com'])])
        expect(await findCertificateIdForHostname('app.negri.es')).toBeNull()
    })

    it('null con hostname vacío (no consulta NPM)', async () => {
        expect(await findCertificateIdForHostname('   ')).toBeNull()
        expect(mocks.listCertificates).not.toHaveBeenCalled()
    })
})

describe('resolveWildcardCertificateId', () => {
    it('devuelve el id cuando existe', async () => {
        mocks.listCertificates.mockResolvedValue([cert(5, ['*.negri.es'])])
        expect(await resolveWildcardCertificateId('app.negri.es')).toBe(5)
    })

    it('lanza si no hay wildcard', async () => {
        mocks.listCertificates.mockResolvedValue([])
        await expect(resolveWildcardCertificateId('app.negri.es')).rejects.toThrow(/wildcard/)
    })
})

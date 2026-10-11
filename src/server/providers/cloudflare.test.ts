import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ cfJson: vi.fn() }))
vi.mock('./cloudflare-http', () => ({ cfJson: mocks.cfJson, CF_BASE: 'https://api.cloudflare.com/client/v4' }))

const { createRecord, deleteRecord, findRecord, listRecords, listZones, updateRecord } = await import('./cloudflare')

const api = { token: 'tok', zoneId: 'z1' }

beforeEach(() => vi.clearAllMocks())

describe('cliente Cloudflare DNS', () => {
    it('listZones pide las zonas accesibles', async () => {
        mocks.cfJson.mockResolvedValue([{ id: 'z1', name: 'negri.es' }])
        await listZones('tok')
        expect(mocks.cfJson).toHaveBeenCalledWith('tok', '/zones?per_page=50')
    })

    it('findRecord filtra por nombre y tipo', async () => {
        mocks.cfJson.mockResolvedValue([{ id: 'r1' }])
        await findRecord(api, 'app.negri.es', 'A')
        const path = mocks.cfJson.mock.calls[0][1]
        expect(path).toContain('/zones/z1/dns_records?')
        expect(path).toContain('name=app.negri.es')
        expect(path).toContain('type=A')
    })

    it('findRecord devuelve null si no hay registros', async () => {
        mocks.cfJson.mockResolvedValue([])
        await expect(findRecord(api, 'app.negri.es')).resolves.toBeNull()
    })

    it('listRecords pide hasta 1000 de la zona', async () => {
        mocks.cfJson.mockResolvedValue([])
        await listRecords(api)
        expect(mocks.cfJson.mock.calls[0][1]).toBe('/zones/z1/dns_records?per_page=1000')
    })

    it('createRecord hace POST con comment gestionado y ttl auto', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'r1' })
        await createRecord(api, { name: 'app.negri.es', type: 'A', content: '1.2.3.4', proxied: true })
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/dns_records')
        expect(init.method).toBe('POST')
        const body = JSON.parse(init.body)
        expect(body).toMatchObject({ type: 'A', name: 'app.negri.es', content: '1.2.3.4', proxied: true, ttl: 1 })
        expect(body.comment).toBeTruthy()
    })

    it('updateRecord hace PUT al registro por id', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'r1' })
        await updateRecord(api, 'r1', { name: 'app.negri.es', type: 'A', content: '9.9.9.9', proxied: false })
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/dns_records/r1')
        expect(init.method).toBe('PUT')
    })

    it('deleteRecord hace DELETE al registro por id', async () => {
        mocks.cfJson.mockResolvedValue({ id: 'r1' })
        await deleteRecord(api, 'r1')
        const [, path, init] = mocks.cfJson.mock.calls[0]
        expect(path).toBe('/zones/z1/dns_records/r1')
        expect(init.method).toBe('DELETE')
    })
})

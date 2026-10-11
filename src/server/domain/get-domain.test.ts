import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError } from '../errors'

vi.mock('../db/client', async () => {
    const { dbMock } = await import('../../../test/fake-db')
    return { db: dbMock.db }
})

const { dbMock } = await import('../../../test/fake-db')
const { getDomainOrThrow } = await import('./get-domain')

beforeEach(() => dbMock.reset())

describe('getDomainOrThrow', () => {
    it('devuelve el dominio cuando existe', async () => {
        dbMock.queueSelect([{ id: 'd1', hostname: 'app.negri.es' }])
        const domain = await getDomainOrThrow('d1')
        expect(domain.hostname).toBe('app.negri.es')
    })

    it('lanza NotFoundError cuando no existe', async () => {
        dbMock.queueSelect([])
        await expect(getDomainOrThrow('nope')).rejects.toBeInstanceOf(NotFoundError)
    })
})

import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.FILE_DOMAINS_PATH = '/base'

const mocks = vi.hoisted(() => ({ stat: vi.fn(), readdir: vi.fn(), readFile: vi.fn() }))
vi.mock('node:fs/promises', () => ({ stat: mocks.stat, readdir: mocks.readdir, readFile: mocks.readFile }))

const { readDomainFiles } = await import('./reader')

beforeEach(() => vi.clearAllMocks())

describe('readDomainFiles', () => {
    it('directorio: lee solo .yaml/.yml, ordenados, excluyendo el resto', async () => {
        mocks.stat.mockResolvedValue({ isDirectory: () => true })
        mocks.readdir.mockResolvedValue(['b.yaml', 'a.yml', 'notes.txt', 'c.yaml'])
        mocks.readFile.mockImplementation(async (path: string) => `contenido de ${path}`)

        const files = await readDomainFiles()
        expect(files.map((f) => f.path)).toEqual([
            join('/base', 'a.yml'),
            join('/base', 'b.yaml'),
            join('/base', 'c.yaml'),
        ])
        expect(files[0].content).toBe(`contenido de ${join('/base', 'a.yml')}`)
    })

    it('fichero único: devuelve su contenido', async () => {
        mocks.stat.mockResolvedValue({ isDirectory: () => false })
        mocks.readFile.mockResolvedValue('un solo fichero')

        const files = await readDomainFiles()
        expect(files).toEqual([{ path: '/base', content: 'un solo fichero' }])
        expect(mocks.readdir).not.toHaveBeenCalled()
    })
})

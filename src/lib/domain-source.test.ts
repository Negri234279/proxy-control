import { describe, expect, it } from 'vitest'
import { sourceBadge } from './domain-source'

describe('sourceBadge', () => {
    it('manual no lleva badge', () => {
        expect(sourceBadge('manual', null, null)).toBeNull()
    })

    it('docker usa el host como label', () => {
        const badge = sourceBadge('docker', 'pi', null)
        expect(badge).toMatchObject({ label: 'pi' })
        expect(badge?.title).toMatch(/pi/)
    })

    it('docker sin host cae a "docker" y título "desconocido"', () => {
        const badge = sourceBadge('docker', null, null)
        expect(badge?.label).toBe('docker')
        expect(badge?.title).toMatch(/desconocido/)
    })

    it('file usa el basename del fichero', () => {
        const badge = sourceBadge('file', null, '/config/domains.d/panels.yaml')
        expect(badge?.label).toBe('panels.yaml')
        expect(badge?.title).toMatch(/panels\.yaml/)
    })

    it('file maneja rutas Windows', () => {
        expect(sourceBadge('file', null, 'C:\\config\\nas.yaml')?.label).toBe('nas.yaml')
    })

    it('file sin ruta cae a "file"', () => {
        expect(sourceBadge('file', null, null)?.label).toBe('file')
    })
})

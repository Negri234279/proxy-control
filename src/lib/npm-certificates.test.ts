import { describe, expect, it } from 'vitest'
import { certificateBaseWildcard, matchCertificate } from './npm-certificates'

describe('certificateBaseWildcard', () => {
    it('deriva base y wildcard de un hostname', () => {
        expect(certificateBaseWildcard('app.negri.es')).toEqual({ base: 'negri.es', wildcard: '*.negri.es' })
        expect(certificateBaseWildcard('a.b.negri.es')).toEqual({ base: 'b.negri.es', wildcard: '*.b.negri.es' })
    })
})

describe('matchCertificate', () => {
    const certs = [
        { id: 1, domainNames: ['otra.com'] },
        { id: 2, domainNames: ['*.negri.es', 'negri.es'] },
        { id: 3, domainNames: ['exacto.negri.es'] },
    ]

    it('casa por nombre exacto cuando es el único que cubre el host', () => {
        expect(matchCertificate('exacto.negri.es', [{ id: 3, domainNames: ['exacto.negri.es'] }])?.id).toBe(3)
    })

    it('devuelve el primer certificado del array que cubre el host (sin prioridad por exactitud)', () => {
        // El wildcard (id 2) aparece antes que el exacto (id 3): gana el primero.
        expect(matchCertificate('exacto.negri.es', certs)?.id).toBe(2)
    })

    it('casa por wildcard *.base', () => {
        expect(matchCertificate('app.negri.es', certs)?.id).toBe(2)
    })

    it('casa por el dominio base', () => {
        expect(matchCertificate('negri.es', [{ id: 9, domainNames: ['negri.es'] }])?.id).toBe(9)
    })

    it('es case-insensitive y tolera punto final', () => {
        expect(matchCertificate('APP.NEGRI.ES.', certs)?.id).toBe(2)
    })

    it('undefined si ningún certificado cubre el hostname', () => {
        expect(matchCertificate('app.example.org', certs)).toBeUndefined()
        expect(matchCertificate('', certs)).toBeUndefined()
    })
})

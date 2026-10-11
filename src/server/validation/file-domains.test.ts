import { describe, expect, it } from 'vitest'
import { parseDomainsFile } from './file-domains'

describe('parseDomainsFile — general', () => {
    it('parsea un dominio privado con forward', () => {
        const { specs, errors } = parseDomainsFile(`
domains:
  - hostname: pve-web.negri.es
    visibility: private
    forward: { scheme: https, host: 192.168.1.10, port: 8006 }
    npm: { websockets: true }
`)
        expect(errors).toHaveLength(0)
        expect(specs[0]).toMatchObject({
            hostname: 'pve-web.negri.es',
            visibility: 'private',
            forwardScheme: 'https',
            forwardHost: '192.168.1.10',
            forwardPort: 8006,
            npmOptions: { websockets: true },
        })
    })

    it('aísla una entrada inválida sin invalidar el resto', () => {
        const { specs, errors } = parseDomainsFile(`
domains:
  - hostname: ok.negri.es
    visibility: public
    forward: { scheme: http, host: 10.0.0.5, port: 8080 }
  - hostname: malo.negri.es
    visibility: public
    clave_desconocida: true
`)
        expect(specs).toHaveLength(1)
        expect(specs[0].hostname).toBe('ok.negri.es')
        expect(errors).toHaveLength(1)
        expect(errors[0].hostname).toBe('malo.negri.es')
    })

    it('exige address IPv4 en dnsOnly privado', () => {
        const { specs, errors } = parseDomainsFile(`
domains:
  - hostname: nas.negri.es
    visibility: private
    dnsOnly: true
    address: no-es-ip
`)
        expect(specs).toHaveLength(0)
        expect(errors[0].error).toMatch(/IPv4/)
    })

    it('reporta un YAML corrupto como error de fichero', () => {
        const { specs, errors } = parseDomainsFile(':\n  - [roto')
        expect(specs).toHaveLength(0)
        expect(errors[0].hostname).toBe('(yaml)')
    })

    it('fichero vacío: sin dominios, sin errores', () => {
        expect(parseDomainsFile('')).toEqual({ specs: [], errors: [] })
    })
})

describe('parseDomainsFile — bloque edge', () => {
    const withEdge = (extra: string) => `
domains:
  - hostname: otlp.negri.es
    visibility: public
    forward: { scheme: http, host: 10.0.0.9, port: 4318 }
    cloudflare: { recordType: A, content: 203.0.113.10, proxied: true }
    edge:
${extra}
`

    it('parsea waf + rateLimit en un público proxied', () => {
        const { specs, errors } = parseDomainsFile(
            withEdge(`      waf:
        - description: "solo POST a /collect"
          expression: 'http.request.method ne "POST"'
          action: block
      rateLimit:
        - description: "rl /collect"
          expression: 'http.request.uri.path eq "/collect"'
          requestsPerPeriod: 100
          period: 60
          mitigationTimeout: 600
          action: block`),
        )
        expect(errors).toHaveLength(0)
        expect(specs[0].edge?.waf).toHaveLength(1)
        expect(specs[0].edge?.rateLimit[0].characteristics).toEqual(['ip.src', 'cf.colo.id'])
    })

    it('NO inyecta el host en la expresión (el scoping es cosa de la reconciliación)', () => {
        const { specs } = parseDomainsFile(
            withEdge(`      waf:
        - description: "d"
          expression: 'http.request.method ne "POST"'
          action: block`),
        )
        expect(specs[0].edge?.waf[0].expression).toBe('http.request.method ne "POST"')
        expect(specs[0].edge?.waf[0].expression).not.toContain('http.host')
    })

    it('rechaza edge en un dominio privado', () => {
        const { specs, errors } = parseDomainsFile(`
domains:
  - hostname: priv.negri.es
    visibility: private
    forward: { scheme: https, host: 192.168.1.10, port: 8006 }
    edge:
      waf:
        - description: d
          expression: 'http.request.method ne "POST"'
          action: block
`)
        expect(specs).toHaveLength(0)
        expect(errors[0].error).toMatch(/público/)
    })

    it('rechaza edge si el dominio no es proxied', () => {
        const { specs, errors } = parseDomainsFile(`
domains:
  - hostname: pub.negri.es
    visibility: public
    forward: { scheme: http, host: 10.0.0.5, port: 8080 }
    cloudflare: { recordType: A, content: 203.0.113.10, proxied: false }
    edge:
      waf:
        - description: d
          expression: 'http.request.method ne "POST"'
          action: block
`)
        expect(specs).toHaveLength(0)
        expect(errors[0].error).toMatch(/proxied/)
    })
})

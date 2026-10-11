import { describe, expect, it } from 'vitest'
import { parseContainerLabels } from './docker-labels'

const PREFIX = 'proxy-control'

describe('parseContainerLabels — general', () => {
    it('devuelve null si el container no está habilitado', () => {
        expect(parseContainerLabels({ 'proxy-control.hostname': 'x.negri.es' }, PREFIX)).toBeNull()
    })

    it('parsea un público con forward y opciones NPM', () => {
        const spec = parseContainerLabels(
            {
                'proxy-control.enable': 'true',
                'proxy-control.hostname': 'app.negri.es',
                'proxy-control.visibility': 'public',
                'proxy-control.forward.host': '10.0.0.5',
                'proxy-control.forward.port': '8080',
                'proxy-control.npm.websockets': 'true',
            },
            PREFIX,
        )
        expect(spec).toMatchObject({
            hostname: 'app.negri.es',
            visibility: 'public',
            forwardHost: '10.0.0.5',
            forwardPort: 8080,
            npmOptions: { websockets: true },
        })
    })

    it('exige upstream salvo en dns-only', () => {
        expect(() =>
            parseContainerLabels(
                {
                    'proxy-control.enable': 'true',
                    'proxy-control.hostname': 'app.negri.es',
                    'proxy-control.visibility': 'public',
                },
                PREFIX,
            ),
        ).toThrow()
    })
})

describe('parseContainerLabels — bloque edge (indexado)', () => {
    const publicBase = {
        'proxy-control.enable': 'true',
        'proxy-control.hostname': 'otlp.negri.es',
        'proxy-control.visibility': 'public',
        'proxy-control.forward.host': '10.0.0.9',
        'proxy-control.forward.port': '4318',
        'proxy-control.cf.proxied': 'true',
    }

    it('parsea waf[0] y ratelimit[0] con characteristics en CSV', () => {
        const spec = parseContainerLabels(
            {
                ...publicBase,
                'proxy-control.edge.waf[0].description': 'solo POST',
                'proxy-control.edge.waf[0].expression': 'http.request.method ne "POST"',
                'proxy-control.edge.waf[0].action': 'block',
                'proxy-control.edge.ratelimit[0].description': 'rl',
                'proxy-control.edge.ratelimit[0].expression': 'http.request.uri.path eq "/collect"',
                'proxy-control.edge.ratelimit[0].requests-per-period': '100',
                'proxy-control.edge.ratelimit[0].period': '60',
                'proxy-control.edge.ratelimit[0].mitigation-timeout': '600',
                'proxy-control.edge.ratelimit[0].characteristics': 'ip.src,cf.colo.id',
                'proxy-control.edge.ratelimit[0].action': 'block',
            },
            PREFIX,
        )
        expect(spec?.edge?.waf).toHaveLength(1)
        expect(spec?.edge?.waf[0].expression).toBe('http.request.method ne "POST"')
        expect(spec?.edge?.rateLimit[0].requestsPerPeriod).toBe(100)
        expect(spec?.edge?.rateLimit[0].characteristics).toEqual(['ip.src', 'cf.colo.id'])
    })

    it('no inyecta el host en la expresión (scoping = reconciliación)', () => {
        const spec = parseContainerLabels(
            {
                ...publicBase,
                'proxy-control.edge.waf[0].description': 'd',
                'proxy-control.edge.waf[0].expression': 'http.request.method ne "POST"',
            },
            PREFIX,
        )
        expect(spec?.edge?.waf[0].expression).not.toContain('http.host')
    })

    it('rechaza edge en un dominio privado (campo edge)', () => {
        let fields: Record<string, string> | undefined
        try {
            parseContainerLabels(
                {
                    'proxy-control.enable': 'true',
                    'proxy-control.hostname': 'priv.negri.es',
                    'proxy-control.visibility': 'private',
                    'proxy-control.forward.host': '192.168.1.10',
                    'proxy-control.forward.port': '8006',
                    'proxy-control.edge.waf[0].description': 'd',
                    'proxy-control.edge.waf[0].expression': 'http.request.method ne "POST"',
                },
                PREFIX,
            )
        } catch (error) {
            fields = (error as { fields?: Record<string, string> }).fields
        }
        expect(fields?.edge).toMatch(/público/)
    })

    it('rechaza un period inválido en una regla de rate limiting', () => {
        expect(() =>
            parseContainerLabels(
                {
                    ...publicBase,
                    'proxy-control.edge.ratelimit[0].description': 'rl',
                    'proxy-control.edge.ratelimit[0].expression': 'http.request.uri.path eq "/x"',
                    'proxy-control.edge.ratelimit[0].requests-per-period': '100',
                    'proxy-control.edge.ratelimit[0].period': '45',
                    'proxy-control.edge.ratelimit[0].mitigation-timeout': '600',
                },
                PREFIX,
            ),
        ).toThrow()
    })
})

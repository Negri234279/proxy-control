import { beforeEach, describe, expect, it, vi } from 'vitest'

// env mutable para ejercitar las distintas combinaciones de DOCKER_HOSTS/DOCKER_HOST.
const mocks = vi.hoisted(() => ({
    env: {
        DOCKER_HOSTS: undefined as string | undefined,
        DOCKER_HOST: undefined as string | undefined,
        DOCKER_SOCKET_PATH: '/var/run/docker.sock',
        DOCKER_LABEL_PREFIX: 'proxy-control',
    },
}))

vi.mock('../config/env', () => ({ env: mocks.env }))

const { dockerHostsFromEnv, enableLabel } = await import('./api')

beforeEach(() => {
    mocks.env.DOCKER_HOSTS = undefined
    mocks.env.DOCKER_HOST = undefined
    mocks.env.DOCKER_SOCKET_PATH = '/var/run/docker.sock'
    mocks.env.DOCKER_LABEL_PREFIX = 'proxy-control'
})

describe('dockerHostsFromEnv', () => {
    it('parsea DOCKER_HOSTS con nombre=url (tcp y unix)', () => {
        mocks.env.DOCKER_HOSTS = 'pi=tcp://10.0.0.1:2375,nas=unix:///var/run/docker.sock'
        const hosts = dockerHostsFromEnv()
        expect(hosts).toEqual([
            { name: 'pi', api: { host: '10.0.0.1', port: 2375 } },
            { name: 'nas', api: { socketPath: '/var/run/docker.sock' } },
        ])
    })

    it('entrada url sin nombre: nombre por defecto host:port', () => {
        mocks.env.DOCKER_HOSTS = 'tcp://docker-a:2375'
        expect(dockerHostsFromEnv()[0]).toEqual({ name: 'docker-a:2375', api: { host: 'docker-a', port: 2375 } })
    })

    it('desambigua nombres colisionados con sufijo', () => {
        mocks.env.DOCKER_HOSTS = 'tcp://a:2375,tcp://a:2375'
        expect(dockerHostsFromEnv().map((h) => h.name)).toEqual(['a:2375', 'a:2375-2'])
    })

    it('no parte el esquema por el "=" (tcp://)', () => {
        mocks.env.DOCKER_HOSTS = 'tcp://host:2375'
        expect(dockerHostsFromEnv()[0].api).toEqual({ host: 'host', port: 2375 })
    })

    it('lanza ante un esquema no soportado', () => {
        mocks.env.DOCKER_HOSTS = 'ftp://x'
        expect(() => dockerHostsFromEnv()).toThrow(/inválido/)
    })

    it('legacy: DOCKER_HOST único cuando no hay DOCKER_HOSTS', () => {
        mocks.env.DOCKER_HOST = 'tcp://legacy:2375'
        expect(dockerHostsFromEnv()).toEqual([{ name: 'legacy:2375', api: { host: 'legacy', port: 2375 } }])
    })

    it('fallback al socket unix local', () => {
        expect(dockerHostsFromEnv()).toEqual([{ name: 'local', api: { socketPath: '/var/run/docker.sock' } }])
    })
})

describe('enableLabel', () => {
    it('compone <prefix>.enable', () => {
        expect(enableLabel()).toBe('proxy-control.enable')
        mocks.env.DOCKER_LABEL_PREFIX = 'otro'
        expect(enableLabel()).toBe('otro.enable')
    })
})

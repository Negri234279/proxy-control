import { describe, expect, it } from 'vitest'
import { decrypt, decryptJson, encrypt, encryptJson } from './crypto'

describe('crypto (AES-256-GCM)', () => {
    it('cifra y descifra ida y vuelta', () => {
        const secret = 'cf-token-super-secreto'
        const payload = encrypt(secret)

        expect(payload.startsWith('v1:')).toBe(true)
        expect(payload).not.toContain(secret)
        expect(decrypt(payload)).toBe(secret)
    })

    it('round-trip de JSON', () => {
        const value = { apiToken: 'abc', nested: { n: 1 } }
        expect(decryptJson(encryptJson(value))).toEqual(value)
    })

    it('cada cifrado usa un IV distinto (no determinista)', () => {
        expect(encrypt('x')).not.toBe(encrypt('x'))
    })

    it('rechaza un formato no soportado', () => {
        expect(() => decrypt('v2:a:b:c')).toThrow('formato no soportado')
        expect(() => decrypt('sin-formato')).toThrow()
    })

    it('detecta manipulación del ciphertext (auth tag)', () => {
        const payload = encrypt('dato')
        const [v, iv, tag] = payload.split(':')
        const tampered = `${v}:${iv}:${tag}:${Buffer.from('otro').toString('base64')}`
        expect(() => decrypt(tampered)).toThrow()
    })
})

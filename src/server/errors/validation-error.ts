export type FieldErrors = Record<string, string>

// Error de validación de entrada. Se mapea a HTTP 400 con `fields` (campo → mensaje).
export class ValidationError extends Error {
    readonly fields: FieldErrors

    constructor(message: string, fields: FieldErrors = {}) {
        super(message)
        this.name = 'ValidationError'
        this.fields = fields
    }
}

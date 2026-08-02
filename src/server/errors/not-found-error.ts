// Recurso inexistente. Se mapea a HTTP 404.
export class NotFoundError extends Error {
    constructor(message = 'Recurso no encontrado') {
        super(message)
        this.name = 'NotFoundError'
    }
}

import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { domains, type Domain } from '../db/schema'
import { NotFoundError } from '../errors'

export async function getDomainOrThrow(id: string): Promise<Domain> {
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1)
    if (!domain) {
        throw new NotFoundError(`No existe el dominio ${id}`)
    }
    return domain
}

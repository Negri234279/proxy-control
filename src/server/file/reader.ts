import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { env } from '../config/env'

// Lee los ficheros de dominios estáticos desde FILE_DOMAINS_PATH. Sin lógica de negocio: solo
// resuelve fichero vs directorio y devuelve el contenido crudo. Un fallo (ruta inexistente/no
// legible) se propaga para que el llamante lo trate (no se orfana nada si no se pudo leer).

export interface DomainFile {
    path: string
    content: string
}

function isYaml(name: string): boolean {
    return name.endsWith('.yaml') || name.endsWith('.yml')
}

export async function readDomainFiles(): Promise<DomainFile[]> {
    const base = env.FILE_DOMAINS_PATH
    const info = await stat(base)

    if (info.isDirectory()) {
        const names = (await readdir(base)).filter(isYaml).sort()
        const files: DomainFile[] = []
        for (const name of names) {
            const path = join(base, name)
            files.push({ path, content: await readFile(path, 'utf8') })
        }

        return files
    }

    return [{ path: base, content: await readFile(base, 'utf8') }]
}

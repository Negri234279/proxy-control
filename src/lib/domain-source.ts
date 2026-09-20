import type { DomainSource } from './domain-types'

// Metadata de presentación del badge de origen de un dominio. Devuelve null para 'manual'
// (los dominios manuales no llevan badge de origen).

export interface SourceBadge {
    label: string
    title: string
}

// `nas.yaml` a partir de `/config/domains.d/nas.yaml` (para un badge corto y legible).
function basename(path: string): string {
    const parts = path.split(/[/\\]/)
    return parts[parts.length - 1] || path
}

export function sourceBadge(
    source: DomainSource,
    dockerHost: string | null,
    sourceRef: string | null,
): SourceBadge | null {
    if (source === 'docker') {
        const host = dockerHost ?? 'desconocido'
        return {
            label: dockerHost ?? 'docker',
            title: `Dominio gestionado por labels de Docker en el host ${host}`,
        }
    }

    if (source === 'file') {
        return {
            label: sourceRef ? basename(sourceRef) : 'file',
            title: `Dominio gestionado por fichero YAML${sourceRef ? ` (${sourceRef})` : ''}`,
        }
    }

    return null
}

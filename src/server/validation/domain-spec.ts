import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'

// Especificación de un dominio derivada de una fuente declarativa (labels de Docker, fichero
// YAML, …). Es el formato intermedio que se traduce a la fila deseada del dominio y alimenta
// la reconciliación. No lleva lógica: solo la forma.
export interface DomainSpec {
    hostname: string
    visibility: 'public' | 'private'
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: number
    npmOptions?: Partial<NpmOptions>
    advancedConfig?: string
    customLocations?: CustomLocation[]
    certificateId?: number
    cfRecordType?: CfRecordType
    cfContent?: string
    cfProxied?: boolean
    cfZoneId?: string
}

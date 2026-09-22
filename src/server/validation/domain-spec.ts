import type { CfRecordType, CustomLocation, ForwardScheme, NpmOptions } from '../../lib/domain-types'

// Especificación de un dominio derivada de una fuente declarativa (labels de Docker, fichero
// YAML, …). Es el formato intermedio que se traduce a la fila deseada del dominio y alimenta
// la reconciliación. No lleva lógica: solo la forma.
export interface DomainSpec {
    hostname: string
    visibility: 'public' | 'private'
    // Solo DNS: registra la resolución (CF/Mikrotik) sin crear proxy host en NPM. En ese
    // modo el upstream (forwardHost/Port) es opcional (no hay proxy que lo use).
    dnsOnly?: boolean
    // Destino del A estático del Mikrotik en solo-DNS privado (IP del servicio real).
    dnsTarget?: string
    forwardScheme: ForwardScheme
    forwardHost?: string
    forwardPort?: number
    npmOptions?: Partial<NpmOptions>
    advancedConfig?: string
    customLocations?: CustomLocation[]
    certificateId?: number
    cfRecordType?: CfRecordType
    cfContent?: string
    cfProxied?: boolean
    cfZoneId?: string
}

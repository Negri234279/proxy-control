// Validación de hostname (FQDN). No admite comodines: los dominios concretos son
// subdominios como `app.negri.es`.
export const HOSTNAME_REGEX = /^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/i

export function isHostname(value: string): boolean {
    return HOSTNAME_REGEX.test(value)
}

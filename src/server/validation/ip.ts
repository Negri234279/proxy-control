const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function isIpv4(value: string): boolean {
    const match = IPV4_REGEX.exec(value)
    if (!match) {
        return false
    }
    return match.slice(1).every((octet) => Number(octet) <= 255)
}

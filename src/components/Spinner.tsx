interface Props {
    size?: number
}

export function Spinner({ size = 16 }: Props) {
    return (
        <span
            class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
            style={{ width: size, height: size }}
            aria-hidden="true"
        />
    )
}

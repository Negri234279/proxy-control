interface Props {
    checked: boolean
    onChange: (value: boolean) => void
    label: string
}

export function Toggle({ checked, onChange, label }: Props) {
    return (
        <label class="flex cursor-pointer items-center gap-2 text-sm select-none">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                style={{ backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
                <span
                    class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    style={{ transform: checked ? 'translateX(16px)' : 'none' }}
                />
            </button>
            <span>{label}</span>
        </label>
    )
}

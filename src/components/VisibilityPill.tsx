import type { Visibility } from '../lib/domain-types'
import { VISIBILITY_LABEL } from '../lib/reconcile-state'

export function VisibilityPill({ visibility }: { visibility: Visibility }) {
    const isUnclassified = visibility === 'unclassified'
    return (
        <span
            class="inline-block rounded-full border px-2 py-0.5 text-xs whitespace-nowrap"
            style={{
                borderColor: 'var(--color-border)',
                color: isUnclassified ? 'var(--color-neutral)' : 'var(--color-muted)',
            }}
        >
            {VISIBILITY_LABEL[visibility]}
        </span>
    )
}

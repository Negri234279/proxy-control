import type { DomainDiffView, DomainListItem } from '../lib/domain-types'
import { dnsProviderLabel, stateMeta, type RowState } from '../lib/reconcile-state'
import { Spinner } from './Spinner'
import { StatusBadge } from './StatusBadge'
import { VisibilityPill } from './VisibilityPill'

interface Props {
    row: DomainListItem
    reconciling: boolean
    expanded: boolean
    detail?: DomainDiffView
    detailLoading: boolean
    onToggleDetail: (id: string) => void
    onReconcile: (id: string, hostname: string) => void
    onEdit: (row: DomainListItem) => void
    onDelete: (row: DomainListItem) => void
    onClassify: (row: DomainListItem) => void
}

function upstreamText(row: DomainListItem): string {
    if (!row.forwardHost) {
        return '—'
    }
    return `${row.forwardScheme ?? 'http'}://${row.forwardHost}:${row.forwardPort ?? ''}`
}

function IconButton({
    label,
    glyph,
    onClick,
    disabled,
}: {
    label: string
    glyph: string
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            class="rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
        >
            {glyph}
        </button>
    )
}

export function DomainRow(props: Props) {
    const { row, reconciling, expanded, detail, detailLoading } = props
    const isUnclassified = row.visibility === 'unclassified'
    // Glow de la fila = estado agregado; cada badge usa el de su proveedor.
    const rowState: RowState = reconciling ? 'checking' : (row.reconcileState ?? 'unclassified')
    const npmState: RowState = reconciling ? 'checking' : (row.npmState ?? 'unclassified')
    const dnsState: RowState = reconciling ? 'checking' : (row.dnsState ?? 'unclassified')
    const meta = stateMeta(rowState)
    const provider = dnsProviderLabel(row.visibility)
    const canExpand = Boolean(row.id) && !isUnclassified

    return (
        <>
            <tr
                aria-busy={reconciling}
                class="border-b transition-colors hover:bg-[var(--color-surface-2)]/40"
                style={{
                    borderColor: 'var(--color-border)',
                    boxShadow: `inset 3px 0 0 ${meta.color}, inset 0 0 26px -20px ${meta.color}`,
                }}
            >
                <td class="py-3 pr-3 pl-4">
                    {canExpand ? (
                        <button
                            type="button"
                            onClick={() => props.onToggleDetail(row.id as string)}
                            aria-expanded={expanded}
                            class="text-left font-medium hover:underline"
                        >
                            {row.hostname}
                        </button>
                    ) : (
                        <span class="font-medium">{row.hostname}</span>
                    )}
                </td>
                <td class="px-3 py-3 font-mono text-xs text-[var(--color-muted)]">{upstreamText(row)}</td>
                <td class="px-3 py-3">
                    <VisibilityPill visibility={row.visibility} />
                </td>
                <td class="px-3 py-3">
                    <StatusBadge state={isUnclassified ? 'unclassified' : npmState} />
                </td>
                <td class="px-3 py-3">
                    {isUnclassified ? (
                        <span class="text-[var(--color-neutral)]">—</span>
                    ) : (
                        <StatusBadge state={dnsState} provider={provider} />
                    )}
                </td>
                <td class="py-3 pr-4 pl-3">
                    <div class="flex items-center justify-end gap-1">
                        {isUnclassified ? (
                            <button
                                type="button"
                                onClick={() => props.onClassify(row)}
                                class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)]"
                                style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                            >
                                Clasificar
                            </button>
                        ) : (
                            <>
                                {reconciling ? (
                                    <Spinner />
                                ) : (
                                    <IconButton
                                        label={`Reconciliar ${row.hostname}`}
                                        glyph="↻"
                                        onClick={() => props.onReconcile(row.id as string, row.hostname)}
                                    />
                                )}
                                <IconButton
                                    label={`Editar ${row.hostname}`}
                                    glyph="✎"
                                    onClick={() => props.onEdit(row)}
                                    disabled={reconciling}
                                />
                                <IconButton
                                    label={`Eliminar ${row.hostname}`}
                                    glyph="🗑"
                                    onClick={() => props.onDelete(row)}
                                    disabled={reconciling}
                                />
                            </>
                        )}
                    </div>
                </td>
            </tr>

            {expanded && canExpand ? (
                <tr style={{ backgroundColor: 'var(--color-surface-2)' }}>
                    <td colSpan={6} class="px-4 py-3 text-xs text-[var(--color-muted)]">
                        {detailLoading ? (
                            <span class="inline-flex items-center gap-2">
                                <Spinner size={12} /> Comprobando estado en vivo…
                            </span>
                        ) : detail ? (
                            <div class="flex flex-col gap-1">
                                <span>
                                    NPM: {detail.npm.present ? 'presente' : 'ausente'}
                                    {detail.npm.detail ? ` — ${detail.npm.detail}` : ''}
                                </span>
                                <span>
                                    DNS ({provider}): {detail.dns.present ? 'presente' : 'ausente'}
                                    {detail.dns.detail ? ` — ${detail.dns.detail}` : ''}
                                </span>
                                {detail.issues.length === 0 ? <span>Sin incidencias.</span> : null}
                            </div>
                        ) : (
                            <span>No se pudo cargar el detalle.</span>
                        )}
                    </td>
                </tr>
            ) : null}
        </>
    )
}

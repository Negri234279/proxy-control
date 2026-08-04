import type { DomainDiffView, DomainListItem, ProviderCheckView } from '../lib/domain-types'
import { dnsProviderLabel, stateMeta, type RowState } from '../lib/reconcile-state'
import { ActiveIndicator } from './ActiveIndicator'
import { RowActionsMenu } from './RowActionsMenu'
import { Spinner } from './Spinner'
import { StatusBadge } from './StatusBadge'
import { VisibilityPill } from './VisibilityPill'

interface Props {
    row: DomainListItem
    reconciling: boolean
    expanded: boolean
    detail?: DomainDiffView
    detailLoading: boolean
    toggling: boolean
    onToggleDetail: (id: string) => void
    onToggleEnabled: (npmProxyId: number, hostname: string, enabled: boolean) => void
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

// Detalle de un proveedor en el desplegable: presencia y, si hay drift, las causas
// (esperado vs real) una por línea.
function ProviderDetail({ label, check }: { label: string; check: ProviderCheckView }) {
    return (
        <div class="flex flex-col gap-0.5">
            <span>
                {label}: {check.present ? 'presente' : 'ausente'}
                {check.drift ? ' — drift' : ''}
                {!check.drift && check.detail ? ` — ${check.detail}` : ''}
            </span>
            {check.reasons && check.reasons.length > 0 ? (
                <ul class="ml-4 flex list-disc flex-col gap-0.5" style={{ color: stateMeta('drift').color }}>
                    {check.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            ) : null}
        </div>
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
                            class="rounded text-left font-medium hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
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
                <td class="px-3 py-3">
                    <ActiveIndicator
                        present={!isUnclassified && Boolean(row.npmProxyId)}
                        enabled={row.enabledInNpm}
                        pending={props.toggling}
                    />
                </td>
                <td class="py-3 pr-4 pl-3">
                    <div class="flex items-center justify-end gap-1">
                        {isUnclassified ? (
                            <button
                                type="button"
                                onClick={() => props.onClassify(row)}
                                class="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
                                style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
                            >
                                Clasificar
                            </button>
                        ) : (
                            <RowActionsMenu
                                hostname={row.hostname}
                                detailsHref={`/domains/${row.id}`}
                                present={Boolean(row.npmProxyId)}
                                enabled={row.enabledInNpm}
                                reconciling={reconciling}
                                pending={props.toggling}
                                onReconcile={() => props.onReconcile(row.id as string, row.hostname)}
                                onEdit={() => props.onEdit(row)}
                                onToggleEnabled={(next) =>
                                    props.onToggleEnabled(row.npmProxyId as number, row.hostname, next)
                                }
                                onDelete={() => props.onDelete(row)}
                            />
                        )}
                    </div>
                </td>
            </tr>

            {expanded && canExpand ? (
                <tr style={{ backgroundColor: 'var(--color-surface-2)' }}>
                    <td colSpan={7} class="px-4 py-3 text-xs text-[var(--color-muted)]">
                        {detailLoading ? (
                            <span class="inline-flex items-center gap-2">
                                <Spinner size={12} /> Comprobando estado en vivo…
                            </span>
                        ) : detail ? (
                            <div class="flex flex-col gap-1">
                                <ProviderDetail label="NPM" check={detail.npm} />
                                <ProviderDetail label={`DNS (${provider})`} check={detail.dns} />
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

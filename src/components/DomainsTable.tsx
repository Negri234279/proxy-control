import type { ComponentChildren } from 'preact'
import type { LoadStatus } from '../hooks/useDomains'
import type { DomainDiffView, DomainListItem } from '../lib/domain-types'
import { DomainRow } from './DomainRow'

interface DomainStatusView {
    openId: string | null
    detailById: Record<string, DomainDiffView>
    loadingId: string | null
    toggle: (id: string) => void
}

interface Props {
    status: LoadStatus
    rows: DomainListItem[]
    reconcilingIds: Set<string>
    domainStatus: DomainStatusView
    togglingIds: Set<number>
    onToggleEnabled: (npmProxyId: number, hostname: string, enabled: boolean) => void
    onReconcile: (id: string, hostname: string) => void
    onEdit: (row: DomainListItem) => void
    onDelete: (row: DomainListItem) => void
    onClassify: (row: DomainListItem) => void
    onRetry: () => void
    onAdd: () => void
}

const COLUMNS = ['Hostname', 'Upstream', 'Visibilidad', 'NPM', 'DNS', 'Activo', '']

function SkeletonRows() {
    return (
        <>
            {Array.from({ length: 6 }).map((_, index) => (
                <tr key={index} class="border-b" style={{ borderColor: 'var(--color-border)' }}>
                    {COLUMNS.map((_column, cell) => (
                        <td key={cell} class="px-3 py-4">
                            <div class="pc-shimmer h-3 rounded" style={{ backgroundColor: 'var(--color-surface-2)' }} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    )
}

function MessageRow({ children }: { children: ComponentChildren }) {
    return (
        <tr>
            <td colSpan={7} class="px-4 py-16 text-center">
                <div class="mx-auto flex max-w-sm flex-col items-center gap-3 text-[var(--color-muted)]">
                    {children}
                </div>
            </td>
        </tr>
    )
}

export function DomainsTable(props: Props) {
    const { status, rows } = props

    return (
        <div
            class="overflow-x-auto rounded-[var(--radius-card)] border"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
            <table class="w-full border-collapse text-sm">
                <thead>
                    <tr
                        class="sticky top-0 z-10 text-left text-xs tracking-wide text-[var(--color-muted)] uppercase"
                        style={{ backgroundColor: 'var(--color-surface)' }}
                    >
                        {COLUMNS.map((column, index) => (
                            <th
                                key={column || index}
                                scope="col"
                                class="border-b px-3 py-2.5 font-medium first:pl-4 last:pr-4"
                                style={{ borderColor: 'var(--color-border)' }}
                            >
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {status === 'loading' ? <SkeletonRows /> : null}

                    {status === 'error' ? (
                        <MessageRow>
                            <span class="text-base text-[var(--color-text)]">No se pudieron cargar los dominios</span>
                            <span>NPM o la API no respondieron.</span>
                            <button
                                type="button"
                                onClick={props.onRetry}
                                class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                                style={{ borderColor: 'var(--color-border)' }}
                            >
                                Reintentar
                            </button>
                        </MessageRow>
                    ) : null}

                    {status === 'ready' && rows.length === 0 ? (
                        <MessageRow>
                            <span class="text-base text-[var(--color-text)]">No hay dominios</span>
                            <span>Añade tu primer dominio o clasifica los que NPM ya conoce.</span>
                            <button
                                type="button"
                                onClick={props.onAdd}
                                class="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                                style={{ backgroundColor: 'var(--color-accent)' }}
                            >
                                + Añadir dominio
                            </button>
                        </MessageRow>
                    ) : null}

                    {status === 'ready'
                        ? rows.map((row) => (
                              <DomainRow
                                  key={row.id ?? row.hostname}
                                  row={row}
                                  reconciling={Boolean(row.id && props.reconcilingIds.has(row.id))}
                                  expanded={props.domainStatus.openId === row.id}
                                  detail={row.id ? props.domainStatus.detailById[row.id] : undefined}
                                  detailLoading={props.domainStatus.loadingId === row.id}
                                  onToggleDetail={props.domainStatus.toggle}
                                  toggling={Boolean(row.npmProxyId && props.togglingIds.has(row.npmProxyId))}
                                  onToggleEnabled={props.onToggleEnabled}
                                  onReconcile={props.onReconcile}
                                  onEdit={props.onEdit}
                                  onDelete={props.onDelete}
                                  onClassify={props.onClassify}
                              />
                          ))
                        : null}
                </tbody>
            </table>
        </div>
    )
}

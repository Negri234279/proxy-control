import type { SourceFilter, StateFilter, VisibilityFilter } from '../hooks/useDomainFilters'

interface Props {
    query: string
    setQuery: (value: string) => void
    visibility: VisibilityFilter
    setVisibility: (value: VisibilityFilter) => void
    state: StateFilter
    setState: (value: StateFilter) => void
    source: SourceFilter
    setSource: (value: SourceFilter) => void
    dockerEnabled: boolean
    count: number
}

const selectClass = 'rounded-md border bg-transparent px-2 py-1.5 text-sm'
const selectStyle = { borderColor: 'var(--color-border)' }

export function DomainsToolbar(props: Props) {
    return (
        <div class="mb-3 flex flex-wrap items-center gap-3">
            <input
                type="search"
                value={props.query}
                onInput={(event) => props.setQuery((event.target as HTMLInputElement).value)}
                placeholder="Buscar hostname / upstream…"
                aria-label="Buscar dominios"
                class="min-w-56 flex-1 rounded-md border bg-transparent px-3 py-1.5 text-sm"
                style={selectStyle}
            />

            <label class="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                Visibilidad
                <select
                    value={props.visibility}
                    onChange={(event) =>
                        props.setVisibility((event.target as HTMLSelectElement).value as VisibilityFilter)
                    }
                    class={selectClass}
                    style={selectStyle}
                >
                    <option value="all">Todas</option>
                    <option value="public">Público</option>
                    <option value="private">Privado</option>
                    <option value="unclassified">Sin clasificar</option>
                </select>
            </label>

            <label class="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                Estado
                <select
                    value={props.state}
                    onChange={(event) => props.setState((event.target as HTMLSelectElement).value as StateFilter)}
                    class={selectClass}
                    style={selectStyle}
                >
                    <option value="all">Todos</option>
                    <option value="synced">OK</option>
                    <option value="drift">Drift</option>
                    <option value="missing">Falta</option>
                    <option value="error">Error</option>
                    <option value="unclassified">Sin clasificar</option>
                </select>
            </label>

            {props.dockerEnabled ? (
                <label class="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                    Origen
                    <select
                        value={props.source}
                        onChange={(event) => props.setSource((event.target as HTMLSelectElement).value as SourceFilter)}
                        class={selectClass}
                        style={selectStyle}
                    >
                        <option value="all">Todos</option>
                        <option value="manual">Manual</option>
                        <option value="docker">Docker</option>
                        <option value="orphaned">Huérfanos</option>
                    </select>
                </label>
            ) : null}

            <span class="text-sm text-[var(--color-muted)]">{props.count} dominios</span>
        </div>
    )
}

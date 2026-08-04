import { useDnsProviders } from '../hooks/useDnsProviders'
import { useToasts } from '../hooks/useToasts'
import {
    descriptorFor,
    PROVIDER_KINDS,
    SCOPE_LABEL,
    type DnsProviderScope,
    type DnsProviderView,
} from '../lib/dns-providers'
import { DnsProviderFormModal } from './DnsProviderFormModal'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { ToastRegion } from './ToastRegion'
import { Toggle } from './Toggle'

type Providers = ReturnType<typeof useDnsProviders>

const SCOPES: DnsProviderScope[] = ['public', 'private']
const cardStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }
const btnBase =
    'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none'

function ProviderRow({ provider, providers }: { provider: DnsProviderView; providers: Providers }) {
    const descriptor = descriptorFor(provider.kind)
    return (
        <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            style={{ borderColor: 'var(--color-border)' }}
        >
            <div class="flex flex-col">
                <span class="font-medium">{provider.name}</span>
                <span class="text-xs text-[var(--color-muted)]">
                    {descriptor?.label ?? provider.kind} · {provider.hasSecret ? 'secreto configurado' : 'sin secreto'}
                </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <Toggle
                    label={provider.enabled ? 'Activo' : 'Inactivo'}
                    checked={provider.enabled}
                    onChange={(value) => providers.toggleEnabled(provider, value)}
                />
                <button
                    type="button"
                    class={btnBase}
                    style={{ borderColor: 'var(--color-border)' }}
                    disabled={providers.testingId === provider.id}
                    onClick={() => providers.test(provider)}
                >
                    {providers.testingId === provider.id ? 'Probando…' : 'Probar'}
                </button>
                <button
                    type="button"
                    class={btnBase}
                    style={{ borderColor: 'var(--color-border)' }}
                    onClick={() => providers.openEdit(provider)}
                >
                    Editar
                </button>
                <button
                    type="button"
                    class={btnBase}
                    style={{ borderColor: 'var(--color-error)', color: 'var(--color-error)' }}
                    onClick={() => providers.requestDelete(provider)}
                >
                    Eliminar
                </button>
            </div>
        </div>
    )
}

export function DnsProvidersPanel() {
    const { toasts, push, dismiss } = useToasts()
    const providers = useDnsProviders({ pushToast: push })

    return (
        <div class="mx-auto max-w-3xl px-4 py-8">
            <a
                href="/"
                class="mb-6 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
                ← Dominios
            </a>

            <h1 class="text-xl font-semibold">Proveedores DNS</h1>
            <p class="mt-1 mb-6 text-sm text-[var(--color-muted)]">
                Configura los proveedores que resuelven los dominios públicos y privados. Los secretos (tokens,
                contraseñas) se guardan cifrados.
            </p>

            {providers.status === 'loading' ? (
                <div class="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                    <Spinner size={14} /> Cargando…
                </div>
            ) : null}

            {providers.status === 'error' ? (
                <div class="rounded-md border p-4 text-sm" style={cardStyle}>
                    <p>No se pudieron cargar los proveedores.</p>
                    <button type="button" class={`mt-2 ${btnBase}`} onClick={providers.refetch}>
                        Reintentar
                    </button>
                </div>
            ) : null}

            {providers.status === 'ready' ? (
                <div class="flex flex-col gap-6">
                    {SCOPES.map((scope) => {
                        const scopeProviders = providers.providers.filter((provider) => provider.scope === scope)
                        const kinds = PROVIDER_KINDS.filter((kind) => kind.scope === scope)
                        return (
                            <section key={scope} class="rounded-[var(--radius-card)] border p-4" style={cardStyle}>
                                <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <h2 class="text-sm font-semibold">{SCOPE_LABEL[scope]}</h2>
                                    <div class="flex flex-wrap gap-2">
                                        {kinds.map((kind) => (
                                            <button
                                                key={kind.kind}
                                                type="button"
                                                class={btnBase}
                                                style={{
                                                    borderColor: 'var(--color-accent)',
                                                    color: 'var(--color-accent)',
                                                }}
                                                onClick={() => providers.openCreate(kind)}
                                            >
                                                + Añadir {kind.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {scopeProviders.length === 0 ? (
                                    <p class="text-sm text-[var(--color-muted)]">Ninguno configurado.</p>
                                ) : (
                                    <div class="flex flex-col gap-2">
                                        {scopeProviders.map((provider) => (
                                            <ProviderRow key={provider.id} provider={provider} providers={providers} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        )
                    })}
                </div>
            ) : null}

            <DnsProviderFormModal providers={providers} />

            {providers.pendingDelete ? (
                <Modal
                    title="Eliminar proveedor"
                    onClose={() => providers.requestDelete(null)}
                    footer={
                        <>
                            <button
                                type="button"
                                onClick={() => providers.requestDelete(null)}
                                class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                                style={{ borderColor: 'var(--color-border)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={providers.confirmDelete}
                                class="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                                style={{ backgroundColor: 'var(--color-error)' }}
                            >
                                Eliminar
                            </button>
                        </>
                    }
                >
                    <p class="text-sm">
                        Vas a eliminar <span class="font-semibold">{providers.pendingDelete.name}</span>. Los dominios
                        que dependan de este proveedor dejarán de resolverse hasta configurar otro.
                    </p>
                </Modal>
            ) : null}

            <ToastRegion toasts={toasts} onDismiss={dismiss} />
        </div>
    )
}

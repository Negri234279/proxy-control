import type { ComponentChildren } from 'preact'
import { useDomainDetail } from '../hooks/useDomainDetail'
import type {
    DomainDetailResponse,
    DomainDetailView,
    DomainListItem,
    ProviderCheckView,
    ReconcileState,
} from '../lib/domain-types'
import { NPM_OPTION_LABELS } from '../lib/npm-options'
import { dnsProviderLabel, stateMeta } from '../lib/reconcile-state'
import { ActiveIndicator } from './ActiveIndicator'
import { DomainDetailActions } from './DomainDetailActions'
import { StatusBadge } from './StatusBadge'
import { VisibilityPill } from './VisibilityPill'

const cardStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }

const providerState = (check: ProviderCheckView): ReconcileState =>
    !check.present ? 'missing' : check.drift ? 'drift' : 'synced'

const fmtDate = (value: string | null): string =>
    value
        ? new Date(value).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
          })
        : '—'

// Convierte el detalle en la fila que consumen el form de edición y el diálogo de borrado.
function toListItem(domain: DomainDetailView, enabledInNpm: boolean): DomainListItem {
    return {
        id: domain.id,
        hostname: domain.hostname,
        visibility: domain.visibility,
        source: domain.source,
        orphaned: domain.orphaned,
        forwardScheme: domain.forwardScheme,
        forwardHost: domain.forwardHost,
        forwardPort: domain.forwardPort,
        reconcileState: domain.reconcileState,
        npmState: null,
        dnsState: null,
        npmProxyId: domain.npmProxyId,
        enabledInNpm,
        npmOptions: domain.npmOptions,
        customLocations: domain.customLocations,
        advancedConfig: domain.advancedConfig,
        certificateId: domain.certificateId,
        cfRecordType: domain.cfRecordType,
        cfContent: domain.cfContent,
        cfProxied: domain.cfProxied,
        cfZoneId: domain.cfZoneId,
        cfZoneName: domain.cfZoneName,
    }
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
    return (
        <section class="rounded-[var(--radius-card)] border p-4" style={cardStyle}>
            <h2 class="mb-3 text-sm font-semibold">{title}</h2>
            {children}
        </section>
    )
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
    return (
        <div>
            <dt class="text-xs text-[var(--color-muted)]">{label}</dt>
            <dd>{children}</dd>
        </div>
    )
}

function ProviderLine({ label, check }: { label: string; check: ProviderCheckView }) {
    return (
        <div>
            <span class="font-medium">{label}:</span> {check.present ? 'presente' : 'ausente'}
            {check.drift ? ' — drift' : ''}
            {check.reasons && check.reasons.length > 0 ? (
                <ul class="mt-1 ml-4 flex list-disc flex-col gap-0.5 text-xs" style={{ color: 'var(--color-drift)' }}>
                    {check.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}

// Isla raíz de la página de detalle: arranca con los datos del SSR y se refresca EN SITIO
// tras cada mutación (sin recargar ni navegar).
export function DomainDetail({ initial }: { initial: DomainDetailResponse }) {
    const { data, refreshing, refetch } = useDomainDetail(initial)
    const { domain, status, publicIp } = data

    const provider = dnsProviderLabel(domain.visibility)
    const isPublic = domain.visibility === 'public'
    const upstream = domain.forwardHost
        ? `${domain.forwardScheme}://${domain.forwardHost}:${domain.forwardPort ?? ''}`
        : '—'
    const row = toListItem(domain, status.enabledInNpm)
    const goHome = () => {
        window.location.href = '/'
    }

    return (
        <div class="mx-auto max-w-3xl px-4 py-8">
            <a
                href="/"
                class="mb-6 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
            >
                ← Dominios
            </a>

            <div
                class="flex flex-col gap-5 transition-opacity"
                style={{ opacity: refreshing ? 0.6 : 1 }}
                aria-busy={refreshing}
            >
                <header class="flex flex-col gap-3">
                    <div class="flex flex-wrap items-center gap-3">
                        <h1 class="text-xl font-semibold">{domain.hostname}</h1>
                        <VisibilityPill visibility={domain.visibility} />
                        {domain.source === 'docker' ? (
                            <span
                                class="inline-block rounded-full border px-1.5 py-0.5 text-[11px] tracking-wide uppercase"
                                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
                                aria-label="Dominio gestionado por labels de Docker"
                                title="Dominio gestionado por labels de Docker"
                            >
                                docker
                            </span>
                        ) : null}
                        {domain.orphaned ? (
                            <span
                                class="inline-block rounded-full border px-1.5 py-0.5 text-[11px] tracking-wide uppercase"
                                style={{ borderColor: stateMeta('missing').color, color: stateMeta('missing').color }}
                                aria-label="Huérfano: el contenedor ya no existe; no se ha borrado, revísalo"
                                title="El contenedor ya no existe (no se ha borrado; revísalo)"
                            >
                                huérfano
                            </span>
                        ) : null}
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <StatusBadge state={providerState(status.npm)} provider="NPM" />
                        <StatusBadge state={providerState(status.dns)} provider={provider} />
                        <ActiveIndicator present={status.npm.present} enabled={status.enabledInNpm} pending={false} />
                    </div>
                    <p class="text-xs text-[var(--color-muted)]">
                        Última reconciliación: {fmtDate(domain.lastReconciledAt)}
                    </p>

                    <DomainDetailActions row={row} onMutated={refetch} onDeleted={goHome} />
                </header>

                <Section title="Estado de sincronización">
                    <div class="flex flex-col gap-3 text-sm">
                        <ProviderLine label="NPM" check={status.npm} />
                        <ProviderLine label={`DNS (${provider})`} check={status.dns} />
                        {status.issues.length === 0 ? (
                            <p class="text-xs text-[var(--color-muted)]">Sin incidencias.</p>
                        ) : null}
                    </div>
                </Section>

                <Section title="Detalles">
                    <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <Field label="Visibilidad">{domain.visibility}</Field>
                        <Field label="Upstream">
                            <span class="font-mono text-xs">{upstream}</span>
                        </Field>
                        <Field label="Estado reconcile (DB)">{domain.reconcileState}</Field>
                    </dl>
                </Section>

                <Section title="Opciones NPM">
                    <ul class="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                        {NPM_OPTION_LABELS.map((option) => (
                            <li key={option.key} class="flex items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    style={{
                                        color: domain.npmOptions[option.key]
                                            ? 'var(--color-synced)'
                                            : 'var(--color-muted)',
                                    }}
                                >
                                    {domain.npmOptions[option.key] ? '✔' : '✕'}
                                </span>
                                <span>{option.label}</span>
                            </li>
                        ))}
                    </ul>
                    {domain.advancedConfig ? (
                        <div class="mt-3">
                            <p class="mb-1 text-xs text-[var(--color-muted)]">Config Nginx avanzada</p>
                            <pre
                                class="overflow-x-auto rounded-md border p-2 font-mono text-xs"
                                style={{ borderColor: 'var(--color-border)' }}
                            >
                                {domain.advancedConfig}
                            </pre>
                        </div>
                    ) : null}
                </Section>

                <Section title="Ubicaciones personalizadas">
                    {domain.customLocations.length === 0 ? (
                        <p class="text-sm text-[var(--color-muted)]">Ninguna. Todo va al upstream principal.</p>
                    ) : (
                        <ul class="flex flex-col gap-2">
                            {domain.customLocations.map((location, index) => (
                                <li
                                    key={index}
                                    class="rounded-md border p-2 text-xs"
                                    style={{ borderColor: 'var(--color-border)' }}
                                >
                                    <span class="font-mono font-medium">{location.path}</span>
                                    <span class="text-[var(--color-muted)]">
                                        {' '}
                                        → {location.forwardScheme}://{location.forwardHost}:{location.forwardPort}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section title="DNS y SSL">
                    {isPublic ? (
                        <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                            <Field label="Registro Cloudflare">
                                <span class="font-mono text-xs">
                                    {domain.cfRecordType} → {domain.cfContent ?? `(PUBLIC_IP: ${publicIp ?? '—'})`}
                                </span>
                            </Field>
                            <Field label="Zona Cloudflare">
                                {domain.cfZoneName ?? domain.cfZoneId ?? '(por defecto del proveedor)'}
                            </Field>
                            <Field label="Proxied">{domain.cfProxied ? 'sí (naranja)' : 'no (DNS-only)'}</Field>
                            <Field label="Modo SSL">{domain.sslMode ?? '—'}</Field>
                            <Field label="Certificado (id NPM)">
                                {domain.certificateId ?? 'nuevo (Let’s Encrypt)'}
                            </Field>
                        </dl>
                    ) : (
                        <p class="text-sm text-[var(--color-muted)]">
                            Privado: el DNS lo gestiona el Mikrotik (entrada estática hacia NPM) y el SSL usa el
                            certificado wildcard existente *.example.es (DNS-01).
                        </p>
                    )}
                </Section>

                <Section title="Referencias">
                    <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <Field label="NPM proxy id">
                            <span class="font-mono text-xs">{domain.npmProxyId ?? '—'}</span>
                        </Field>
                        <Field label="Cloudflare record id">
                            <span class="font-mono text-xs">{domain.cloudflareRecordId ?? '—'}</span>
                        </Field>
                        <Field label="Mikrotik DNS id">
                            <span class="font-mono text-xs">{domain.mikrotikDnsId ?? '—'}</span>
                        </Field>
                        <Field label="Creado">
                            <span class="text-xs">{fmtDate(domain.createdAt)}</span>
                        </Field>
                        <Field label="Actualizado">
                            <span class="text-xs">{fmtDate(domain.updatedAt)}</span>
                        </Field>
                    </dl>
                </Section>
            </div>
        </div>
    )
}

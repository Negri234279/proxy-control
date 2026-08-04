import { useRef } from 'preact/hooks'
import type { useCreateDomain } from '../hooks/useCreateDomain'
import { useNpmCertificates } from '../hooks/useNpmCertificates'
import { useZoneSelector } from '../hooks/useZoneSelector'
import { FORM_TABS, tabHasError, type FormTab } from '../lib/domain-form-tabs'
import type { CfRecordType, ForwardScheme } from '../lib/domain-types'
import { NPM_OPTION_LABELS } from '../lib/npm-options'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { Toggle } from './Toggle'

type CreateDomain = ReturnType<typeof useCreateDomain>

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-1.5 text-sm'
const inputStyle = { borderColor: 'var(--color-border)' }

const TITLES: Record<CreateDomain['mode'], { title: string; cta: string }> = {
    add: { title: 'Añadir dominio', cta: 'Añadir dominio' },
    classify: { title: 'Clasificar dominio', cta: 'Clasificar' },
    edit: { title: 'Editar dominio', cta: 'Guardar cambios' },
}

function FieldError({ message }: { message?: string }) {
    if (!message) return null

    return (
        <span class="mt-1 block text-xs" style={{ color: 'var(--color-error)' }}>
            ⚠ {message}
        </span>
    )
}

function TabButton({
    tab,
    active,
    hasError,
    onSelect,
}: {
    tab: FormTab
    active: boolean
    hasError: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={onSelect}
            class="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
            style={
                active
                    ? { borderColor: 'var(--color-accent)', color: 'var(--color-text)' }
                    : { borderColor: 'transparent', color: 'var(--color-muted)' }
            }
        >
            {tab.label}
            {hasError ? (
                <>
                    <span class="ml-1" style={{ color: 'var(--color-error)' }} aria-hidden="true">
                        ⚠
                    </span>
                    <span class="sr-only"> (con errores)</span>
                </>
            ) : null}
        </button>
    )
}

export function DomainFormModal({ create }: { create: CreateDomain }) {
    const certificates = useNpmCertificates()
    const zoneSelector = useZoneSelector(create)
    const tablistRef = useRef<HTMLDivElement>(null)

    if (!create.isOpen) {
        return null
    }

    const { form, fieldErrors, mode, activeTab } = create
    const meta = TITLES[mode]
    const isPublic = form.visibility === 'public'

    // Navegación de la tablist con teclado (flechas/Home/End), moviendo selección + foco.
    const onTablistKeyDown = (event: KeyboardEvent) => {
        const ids = FORM_TABS.map((tab) => tab.id)
        const current = ids.indexOf(activeTab)
        let next = current

        if (event.key === 'ArrowRight') {
            next = (current + 1) % ids.length
        } else if (event.key === 'ArrowLeft') {
            next = (current - 1 + ids.length) % ids.length
        } else if (event.key === 'Home') {
            next = 0
        } else if (event.key === 'End') {
            next = ids.length - 1
        } else {
            return
        }

        event.preventDefault()
        create.setActiveTab(ids[next])
        tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
    }

    return (
        <Modal
            title={meta.title}
            onClose={create.close}
            footer={
                <>
                    <button
                        type="button"
                        onClick={create.close}
                        class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={create.submit}
                        disabled={create.submitting}
                        class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                    >
                        {create.submitting ? <Spinner size={14} /> : null}
                        {meta.cta}
                    </button>
                </>
            }
        >
            <div class="flex flex-col">
                <div
                    ref={tablistRef}
                    role="tablist"
                    aria-label="Secciones del dominio"
                    onKeyDown={onTablistKeyDown}
                    class="sticky top-0 z-10 mb-4 flex gap-1 border-b"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                    {FORM_TABS.map((tab) => (
                        <TabButton
                            key={tab.id}
                            tab={tab}
                            active={activeTab === tab.id}
                            hasError={tabHasError(tab, fieldErrors)}
                            onSelect={() => create.setActiveTab(tab.id)}
                        />
                    ))}
                </div>

                <div
                    role="tabpanel"
                    id={`panel-${activeTab}`}
                    aria-labelledby={`tab-${activeTab}`}
                    class="flex flex-col gap-4"
                >
                    {activeTab === 'detalles' ? (
                        <>
                            <div>
                                <label class="mb-1 block text-sm font-medium">Hostname</label>
                                <input
                                    class={inputClass}
                                    style={inputStyle}
                                    value={form.hostname}
                                    readOnly={mode !== 'add'}
                                    onInput={(event) =>
                                        create.setField('hostname', (event.target as HTMLInputElement).value)
                                    }
                                    placeholder="app.domain.es"
                                />
                                <FieldError message={fieldErrors.hostname} />
                            </div>

                            <div>
                                <span class="mb-1 block text-sm font-medium">Visibilidad</span>
                                <div class="flex gap-4 text-sm">
                                    {(['public', 'private'] as const).map((value) => (
                                        <label key={value} class="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="visibility"
                                                checked={form.visibility === value}
                                                onChange={() => create.setField('visibility', value)}
                                            />
                                            {value === 'public' ? 'Público' : 'Privado'}
                                        </label>
                                    ))}
                                </div>
                                {mode === 'edit' ? (
                                    <p class="mt-1 text-xs" style={{ color: 'var(--color-drift)' }}>
                                        ⚠ Cambiar el tipo borra el DNS del proveedor antiguo (Cloudflare/Mikrotik) y
                                        crea el nuevo al guardar.
                                    </p>
                                ) : null}
                            </div>

                            <div>
                                <label class="mb-1 block text-sm font-medium">Upstream</label>
                                <div class="flex items-center gap-2">
                                    <select
                                        class="rounded-md border bg-transparent px-2 py-1.5 text-sm"
                                        style={inputStyle}
                                        value={form.forwardScheme}
                                        onChange={(event) =>
                                            create.setField(
                                                'forwardScheme',
                                                (event.target as HTMLSelectElement).value as ForwardScheme,
                                            )
                                        }
                                    >
                                        <option value="http">http</option>
                                        <option value="https">https</option>
                                    </select>
                                    <span class="text-[var(--color-muted)]">://</span>
                                    <input
                                        class={inputClass}
                                        style={inputStyle}
                                        value={form.forwardHost}
                                        onInput={(event) =>
                                            create.setField('forwardHost', (event.target as HTMLInputElement).value)
                                        }
                                        placeholder="10.0.0.5"
                                    />
                                    <span class="text-[var(--color-muted)]">:</span>
                                    <input
                                        class="w-24 rounded-md border bg-transparent px-3 py-1.5 text-sm"
                                        style={inputStyle}
                                        type="number"
                                        value={form.forwardPort}
                                        onInput={(event) =>
                                            create.setField('forwardPort', (event.target as HTMLInputElement).value)
                                        }
                                        placeholder="8080"
                                    />
                                </div>
                                <FieldError message={fieldErrors.forwardHost ?? fieldErrors.forwardPort} />
                            </div>
                        </>
                    ) : null}

                    {activeTab === 'opciones' ? (
                        <>
                            <fieldset class="rounded-md border p-3" style={inputStyle}>
                                <legend class="px-1 text-sm font-medium">Opciones NPM</legend>
                                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {NPM_OPTION_LABELS.map((option) => (
                                        <Toggle
                                            key={option.key}
                                            label={option.label}
                                            checked={form.npmOptions[option.key]}
                                            onChange={(value) => create.setOption(option.key, value)}
                                        />
                                    ))}
                                </div>
                            </fieldset>

                            <div>
                                <label class="mb-1 block text-sm font-medium">Config Nginx avanzada</label>
                                <textarea
                                    class="min-h-20 w-full rounded-md border bg-transparent px-3 py-1.5 font-mono text-xs"
                                    style={inputStyle}
                                    value={form.advancedConfig}
                                    onInput={(event) =>
                                        create.setField('advancedConfig', (event.target as HTMLTextAreaElement).value)
                                    }
                                    placeholder="Directivas nginx personalizadas del proxy host (opcional)"
                                />
                            </div>
                        </>
                    ) : null}

                    {activeTab === 'ubicaciones' ? (
                        <fieldset class="rounded-md border p-3" style={inputStyle}>
                            <legend class="px-1 text-sm font-medium">Ubicaciones personalizadas</legend>
                            <div class="flex flex-col gap-3">
                                {form.customLocations.length === 0 ? (
                                    <p class="text-xs text-[var(--color-muted)]">
                                        Ninguna. Todo va al upstream principal.
                                    </p>
                                ) : null}
                                {form.customLocations.map((location, index) => (
                                    <div
                                        key={index}
                                        class="flex flex-col gap-2 rounded-md border p-2"
                                        style={{ borderColor: 'var(--color-border)' }}
                                    >
                                        <div class="flex items-center gap-2">
                                            <input
                                                class={inputClass}
                                                style={inputStyle}
                                                value={location.path}
                                                onInput={(event) =>
                                                    create.updateLocation(
                                                        index,
                                                        'path',
                                                        (event.target as HTMLInputElement).value,
                                                    )
                                                }
                                                placeholder="/api"
                                            />
                                            <button
                                                type="button"
                                                aria-label="Eliminar ubicación"
                                                onClick={() => create.removeLocation(index)}
                                                class="rounded-md px-2 py-1 text-sm hover:bg-[var(--color-surface-2)]"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <select
                                                class="rounded-md border bg-transparent px-2 py-1.5 text-sm"
                                                style={inputStyle}
                                                value={location.forwardScheme}
                                                onChange={(event) =>
                                                    create.updateLocation(
                                                        index,
                                                        'forwardScheme',
                                                        (event.target as HTMLSelectElement).value as ForwardScheme,
                                                    )
                                                }
                                            >
                                                <option value="http">http</option>
                                                <option value="https">https</option>
                                            </select>
                                            <span class="text-[var(--color-muted)]">://</span>
                                            <input
                                                class={inputClass}
                                                style={inputStyle}
                                                value={location.forwardHost}
                                                onInput={(event) =>
                                                    create.updateLocation(
                                                        index,
                                                        'forwardHost',
                                                        (event.target as HTMLInputElement).value,
                                                    )
                                                }
                                                placeholder="10.0.0.6"
                                            />
                                            <span class="text-[var(--color-muted)]">:</span>
                                            <input
                                                class="w-24 rounded-md border bg-transparent px-3 py-1.5 text-sm"
                                                style={inputStyle}
                                                type="number"
                                                value={location.forwardPort}
                                                onInput={(event) =>
                                                    create.updateLocation(
                                                        index,
                                                        'forwardPort',
                                                        Number((event.target as HTMLInputElement).value),
                                                    )
                                                }
                                                placeholder="8080"
                                            />
                                        </div>
                                        <textarea
                                            class="min-h-16 w-full rounded-md border bg-transparent px-3 py-1.5 font-mono text-xs"
                                            style={inputStyle}
                                            value={location.advancedConfig}
                                            onInput={(event) =>
                                                create.updateLocation(
                                                    index,
                                                    'advancedConfig',
                                                    (event.target as HTMLTextAreaElement).value,
                                                )
                                            }
                                            placeholder="Config nginx avanzada de esta ubicación (opcional)"
                                        />
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={create.addLocation}
                                    class="self-start rounded-md border px-2.5 py-1 text-xs hover:bg-[var(--color-surface-2)]"
                                    style={{ borderColor: 'var(--color-border)' }}
                                >
                                    + Añadir ubicación
                                </button>
                            </div>
                        </fieldset>
                    ) : null}

                    {activeTab === 'dns' ? (
                        isPublic ? (
                            <>
                                <fieldset class="rounded-md border p-3" style={inputStyle}>
                                    <legend class="px-1 text-sm font-medium">DNS (Cloudflare)</legend>
                                    <div class="flex flex-col gap-3">
                                        <div>
                                            <label class="mb-1 block text-sm font-medium">Zona</label>
                                            {zoneSelector.loading ? (
                                                <p class="text-xs text-[var(--color-muted)]">Cargando zonas…</p>
                                            ) : zoneSelector.zones.length === 0 ? (
                                                <p class="text-xs text-[var(--color-muted)]">
                                                    No hay zonas. Revisa el token de Cloudflare en{' '}
                                                    <a href="/settings" class="underline">
                                                        Ajustes
                                                    </a>
                                                    .
                                                </p>
                                            ) : (
                                                <select
                                                    class={inputClass}
                                                    style={inputStyle}
                                                    value={form.cfZoneId}
                                                    onChange={(event) => {
                                                        const id = (event.target as HTMLSelectElement).value
                                                        const zone = zoneSelector.zones.find((z) => z.id === id)
                                                        create.setZone(id, zone?.name ?? '')
                                                    }}
                                                >
                                                    <option value="">— elige zona —</option>
                                                    {zoneSelector.zones.map((zone) => (
                                                        <option key={zone.id} value={zone.id}>
                                                            {zone.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        <div class="flex gap-4 text-sm">
                                            {(['A', 'CNAME'] as const).map((value) => (
                                                <label key={value} class="flex items-center gap-2">
                                                    <input
                                                        type="radio"
                                                        name="cfRecordType"
                                                        checked={form.cfRecordType === value}
                                                        onChange={() =>
                                                            create.setField('cfRecordType', value as CfRecordType)
                                                        }
                                                    />
                                                    {value}
                                                </label>
                                            ))}
                                        </div>
                                        <div>
                                            <input
                                                class={inputClass}
                                                style={inputStyle}
                                                value={form.cfContent}
                                                onInput={(event) =>
                                                    create.setField(
                                                        'cfContent',
                                                        (event.target as HTMLInputElement).value,
                                                    )
                                                }
                                                placeholder={
                                                    form.cfRecordType === 'A'
                                                        ? 'IP pública (o vacío = IP por defecto)'
                                                        : 'host destino (o vacío = CNAME por defecto)'
                                                }
                                            />
                                            <FieldError message={fieldErrors.cfContent} />
                                        </div>
                                        <Toggle
                                            label="Proxied (naranja)"
                                            checked={form.cfProxied}
                                            onChange={(value) => create.setField('cfProxied', value)}
                                        />
                                    </div>
                                </fieldset>

                                <div>
                                    <label class="mb-1 block text-sm font-medium">Certificado SSL</label>
                                    <select
                                        class={inputClass}
                                        style={inputStyle}
                                        value={form.certificateId}
                                        onChange={(event) =>
                                            create.setField('certificateId', (event.target as HTMLSelectElement).value)
                                        }
                                    >
                                        <option value="new">Solicitar uno nuevo (Let’s Encrypt)</option>
                                        {certificates.map((certificate) => (
                                            <option key={certificate.id} value={String(certificate.id)}>
                                                {certificate.niceName}
                                            </option>
                                        ))}
                                    </select>
                                    <p class="mt-1 text-xs text-[var(--color-muted)]">
                                        «Nuevo» emite un certificado por hostname; o elige uno existente (p. ej. el
                                        wildcard *.domain.es) para no depender de la emisión por host.
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p
                                class="rounded-md px-3 py-2 text-xs text-[var(--color-muted)]"
                                style={{ backgroundColor: 'var(--color-surface-2)' }}
                            >
                                ℹ Privado: el DNS lo gestiona el Mikrotik (entrada estática hacia NPM) y el SSL usa el
                                certificado wildcard existente *.domain.es (DNS-01). No se emite uno nuevo ni se
                                configura Cloudflare.
                            </p>
                        )
                    ) : null}
                </div>
            </div>
        </Modal>
    )
}

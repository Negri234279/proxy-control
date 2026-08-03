import type { useCreateDomain } from '../hooks/useCreateDomain'
import { useNpmCertificates } from '../hooks/useNpmCertificates'
import type { CfRecordType, ForwardScheme, NpmOptions } from '../lib/domain-types'
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

const NPM_OPTION_LABELS: { key: keyof NpmOptions; label: string }[] = [
    { key: 'blockExploits', label: 'Block common exploits' },
    { key: 'websockets', label: 'Websockets' },
    { key: 'cacheAssets', label: 'Cache assets' },
    { key: 'http2', label: 'HTTP/2' },
    { key: 'hsts', label: 'HSTS' },
    { key: 'hstsSubdomains', label: 'HSTS Subdomains' },
    { key: 'forceSsl', label: 'Force SSL' },
]

function FieldError({ message }: { message?: string }) {
    if (!message) {
        return null
    }
    return (
        <span class="mt-1 block text-xs" style={{ color: 'var(--color-error)' }}>
            ⚠ {message}
        </span>
    )
}

export function DomainFormModal({ create }: { create: CreateDomain }) {
    const certificates = useNpmCertificates()

    if (!create.isOpen) {
        return null
    }

    const { form, fieldErrors, mode } = create
    const meta = TITLES[mode]
    const isPublic = form.visibility === 'public'
    const showCertPicker = isPublic && mode !== 'edit'

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
            <div class="flex flex-col gap-4">
                <div>
                    <label class="mb-1 block text-sm font-medium">Hostname</label>
                    <input
                        class={inputClass}
                        style={inputStyle}
                        value={form.hostname}
                        readOnly={mode !== 'add'}
                        onInput={(event) => create.setField('hostname', (event.target as HTMLInputElement).value)}
                        placeholder="app.negri.es"
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
                                    disabled={mode === 'edit'}
                                    onChange={() => create.setField('visibility', value)}
                                />
                                {value === 'public' ? 'Público' : 'Privado'}
                            </label>
                        ))}
                    </div>
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

                {mode !== 'edit' ? (
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
                ) : null}

                {isPublic ? (
                    <fieldset class="rounded-md border p-3" style={inputStyle}>
                        <legend class="px-1 text-sm font-medium">DNS (Cloudflare)</legend>
                        <div class="flex flex-col gap-3">
                            <div class="flex gap-4 text-sm">
                                {(['A', 'CNAME'] as const).map((value) => (
                                    <label key={value} class="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="cfRecordType"
                                            checked={form.cfRecordType === value}
                                            onChange={() => create.setField('cfRecordType', value as CfRecordType)}
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
                                        create.setField('cfContent', (event.target as HTMLInputElement).value)
                                    }
                                    placeholder={
                                        form.cfRecordType === 'A' ? 'IP pública (o vacío = PUBLIC_IP)' : 'host destino'
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
                ) : null}

                {showCertPicker ? (
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
                            «Nuevo» emite un certificado por hostname; o elige uno existente (p. ej. el wildcard
                            *.negri.es) para no depender de la emisión por host.
                        </p>
                    </div>
                ) : (
                    <p
                        class="rounded-md px-3 py-2 text-xs text-[var(--color-muted)]"
                        style={{ backgroundColor: 'var(--color-surface-2)' }}
                    >
                        ℹ SSL:{' '}
                        {isPublic
                            ? 'se emitirá un certificado nuevo de Let’s Encrypt para este host.'
                            : 'usa el certificado wildcard existente *.negri.es (DNS-01). No emite uno nuevo.'}
                    </p>
                )}
            </div>
        </Modal>
    )
}

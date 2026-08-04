import type { useDnsProviders } from '../hooks/useDnsProviders'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { Toggle } from './Toggle'

type Providers = ReturnType<typeof useDnsProviders>

const inputClass = 'w-full rounded-md border bg-transparent px-3 py-1.5 text-sm'
const inputStyle = { borderColor: 'var(--color-border)' }

// Formulario de crear/editar proveedor DNS. Los campos se generan desde el descriptor del
// `kind`; los secretos se muestran vacíos (nunca se devuelven) y solo se envían si se escriben.
export function DnsProviderFormModal({ providers }: { providers: Providers }) {
    const { form } = providers
    if (!form) {
        return null
    }

    const isEdit = Boolean(form.editing)
    const title = isEdit ? 'Editar proveedor' : `Añadir ${form.descriptor.label}`

    return (
        <Modal
            title={title}
            onClose={providers.closeForm}
            footer={
                <>
                    <button
                        type="button"
                        onClick={providers.closeForm}
                        class="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]"
                        style={{ borderColor: 'var(--color-border)' }}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={providers.submit}
                        disabled={providers.submitting}
                        class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                        style={{ backgroundColor: 'var(--color-accent)' }}
                    >
                        {providers.submitting ? <Spinner size={14} /> : null}
                        {isEdit ? 'Guardar cambios' : 'Crear'}
                    </button>
                </>
            }
        >
            <div class="flex flex-col gap-4">
                <div>
                    <label class="mb-1 block text-sm font-medium">Nombre</label>
                    <input
                        class={inputClass}
                        style={inputStyle}
                        value={form.name}
                        onInput={(event) => providers.setName((event.target as HTMLInputElement).value)}
                    />
                </div>

                {form.descriptor.fields.map((field) =>
                    field.type === 'boolean' ? (
                        <Toggle
                            key={field.key}
                            label={field.label}
                            checked={Boolean(form.values[field.key])}
                            onChange={(value) => providers.setValue(field.key, value)}
                        />
                    ) : (
                        <div key={field.key}>
                            <label class="mb-1 block text-sm font-medium">
                                {field.label}
                                {field.optional ? <span class="text-[var(--color-muted)]"> (opcional)</span> : null}
                            </label>
                            <input
                                class={inputClass}
                                style={inputStyle}
                                type={field.type === 'password' ? 'password' : 'text'}
                                autocomplete={field.secret ? 'new-password' : 'off'}
                                value={String(form.values[field.key] ?? '')}
                                onInput={(event) =>
                                    providers.setValue(field.key, (event.target as HTMLInputElement).value)
                                }
                                placeholder={
                                    isEdit && field.secret ? '•••• (dejar vacío para no cambiar)' : field.placeholder
                                }
                            />
                            {field.help ? <p class="mt-1 text-xs text-[var(--color-muted)]">{field.help}</p> : null}
                        </div>
                    ),
                )}
            </div>
        </Modal>
    )
}

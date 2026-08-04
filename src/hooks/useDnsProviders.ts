import { useCallback, useEffect, useState } from 'preact/hooks'
import { api, type ApiError } from '../lib/api'
import { descriptorFor, type DnsProviderView, type ProviderKindDescriptor } from '../lib/dns-providers'
import type { ToastKind } from './useToasts'

export type LoadStatus = 'loading' | 'ready' | 'error'

type FieldValue = string | boolean

interface FormState {
    editing: DnsProviderView | null
    descriptor: ProviderKindDescriptor
    name: string
    values: Record<string, FieldValue>
}

function initialValues(
    descriptor: ProviderKindDescriptor,
    provider: DnsProviderView | null,
): Record<string, FieldValue> {
    const values: Record<string, FieldValue> = {}
    for (const field of descriptor.fields) {
        if (field.type === 'boolean') {
            values[field.key] = Boolean(provider?.config[field.key] ?? false)
        } else if (field.secret) {
            // Los secretos nunca se prefillan (no se devuelven); vacío = «sin cambios».
            values[field.key] = ''
        } else {
            values[field.key] = String(provider?.config[field.key] ?? '')
        }
    }
    return values
}

// Estado del panel de proveedores DNS: lista, CRUD, prueba de conectividad y el formulario
// (crear/editar) generado desde el descriptor del `kind`.
export function useDnsProviders({ pushToast }: { pushToast: (kind: ToastKind, message: string) => void }) {
    const [providers, setProviders] = useState<DnsProviderView[]>([])
    const [status, setStatus] = useState<LoadStatus>('loading')
    const [form, setForm] = useState<FormState | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [testingId, setTestingId] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<DnsProviderView | null>(null)

    const refetch = useCallback(async () => {
        setStatus('loading')

        try {
            setProviders(await api.listDnsProviders())
            setStatus('ready')
        } catch {
            setStatus('error')
        }
    }, [])

    useEffect(() => {
        void refetch()
    }, [refetch])

    const openCreate = useCallback((descriptor: ProviderKindDescriptor) => {
        setForm({ editing: null, descriptor, name: descriptor.label, values: initialValues(descriptor, null) })
    }, [])

    const openEdit = useCallback((provider: DnsProviderView) => {
        const descriptor = descriptorFor(provider.kind)
        if (!descriptor) {
            return
        }
        setForm({ editing: provider, descriptor, name: provider.name, values: initialValues(descriptor, provider) })
    }, [])

    const closeForm = useCallback(() => setForm(null), [])

    const setName = useCallback((name: string) => {
        setForm((prev) => (prev ? { ...prev, name } : prev))
    }, [])

    const setValue = useCallback((key: string, value: FieldValue) => {
        setForm((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev))
    }, [])

    const submit = useCallback(async () => {
        if (!form) return

        const config: Record<string, unknown> = {}
        const secret: Record<string, unknown> = {}
        const missing: string[] = []

        for (const field of form.descriptor.fields) {
            const value = form.values[field.key]
            if (field.type === 'boolean') {
                config[field.key] = Boolean(value)
                continue
            }

            const text = String(value ?? '').trim()

            if (field.secret) {
                if (text) {
                    secret[field.key] = text
                } else if (!form.editing && !field.optional) {
                    missing.push(field.label)
                }
            } else {
                if (!text && !field.optional) {
                    missing.push(field.label)
                }

                config[field.key] = text
            }
        }

        if (missing.length > 0) {
            pushToast('error', `Faltan campos: ${missing.join(', ')}`)
            return
        }

        setSubmitting(true)

        try {
            if (form.editing) {
                await api.updateDnsProvider(form.editing.id, {
                    name: form.name,
                    config,
                    secret: Object.keys(secret).length > 0 ? secret : undefined,
                })

                pushToast('success', `${form.name} actualizado`)
            } else {
                await api.createDnsProvider({ kind: form.descriptor.kind, name: form.name, config, secret })

                pushToast('success', `${form.name} creado`)
            }

            setForm(null)

            await refetch()
        } catch (error) {
            pushToast('error', (error as ApiError).message)
        } finally {
            setSubmitting(false)
        }
    }, [form, pushToast, refetch])

    const toggleEnabled = useCallback(
        async (provider: DnsProviderView, enabled: boolean) => {
            try {
                await api.updateDnsProvider(provider.id, { enabled })
                await refetch()
            } catch (error) {
                pushToast('error', (error as ApiError).message)
            }
        },
        [pushToast, refetch],
    )

    const test = useCallback(
        async (provider: DnsProviderView) => {
            setTestingId(provider.id)

            try {
                const result = await api.testDnsProvider(provider.id)
                pushToast('success', `${provider.name}: ${result.detail}`)
            } catch (error) {
                pushToast('error', `${provider.name}: ${(error as ApiError).message}`)
            } finally {
                setTestingId(null)
            }
        },
        [pushToast],
    )

    const confirmDelete = useCallback(async () => {
        if (!pendingDelete) return

        try {
            await api.deleteDnsProvider(pendingDelete.id)

            pushToast('success', `${pendingDelete.name} eliminado`)
            setPendingDelete(null)
            
            await refetch()
        } catch (error) {
            pushToast('error', (error as ApiError).message)
        }
    }, [pendingDelete, pushToast, refetch])

    return {
        providers,
        status,
        form,
        submitting,
        testingId,
        pendingDelete,
        refetch,
        openCreate,
        openEdit,
        closeForm,
        setName,
        setValue,
        submit,
        toggleEnabled,
        test,
        requestDelete: setPendingDelete,
        confirmDelete,
    }
}

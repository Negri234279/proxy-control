import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError, type CreateDomainBody, type UpdateDomainBody } from '../lib/api'
import {
    DEFAULT_NPM_OPTIONS,
    type CfRecordType,
    type DomainListItem,
    type ForwardScheme,
    type NpmOptions,
} from '../lib/domain-types'
import type { ToastKind } from './useToasts'

export type FormMode = 'add' | 'classify' | 'edit'

export interface DomainForm {
    hostname: string
    visibility: 'public' | 'private'
    forwardScheme: ForwardScheme
    forwardHost: string
    forwardPort: string
    npmOptions: NpmOptions
    cfRecordType: CfRecordType
    cfContent: string
    cfProxied: boolean
}

const emptyForm = (): DomainForm => ({
    hostname: '',
    visibility: 'public',
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: '',
    npmOptions: { ...DEFAULT_NPM_OPTIONS },
    cfRecordType: 'A',
    cfContent: '',
    cfProxied: true,
})

interface CreateDeps {
    refetch: () => Promise<void>
    pushToast: (kind: ToastKind, message: string) => void
}

// Estado del modal de alta/clasificar/editar: formulario, errores por campo (mapeados
// del 400 `fields`) y envío.
export function useCreateDomain({ refetch, pushToast }: CreateDeps) {
    const [isOpen, setIsOpen] = useState(false)
    const [mode, setMode] = useState<FormMode>('add')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [form, setForm] = useState<DomainForm>(emptyForm)
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)

    const openAdd = useCallback(() => {
        setForm(emptyForm())
        setFieldErrors({})
        setMode('add')
        setEditingId(null)
        setIsOpen(true)
    }, [])

    const openClassify = useCallback((row: DomainListItem) => {
        setForm({
            ...emptyForm(),
            hostname: row.hostname,
            forwardScheme: row.forwardScheme ?? 'http',
            forwardHost: row.forwardHost ?? '',
            forwardPort: row.forwardPort ? String(row.forwardPort) : '',
        })
        setFieldErrors({})
        setMode('classify')
        setEditingId(null)
        setIsOpen(true)
    }, [])

    const openEdit = useCallback((row: DomainListItem) => {
        setForm({
            ...emptyForm(),
            hostname: row.hostname,
            visibility: row.visibility === 'private' ? 'private' : 'public',
            forwardScheme: row.forwardScheme ?? 'http',
            forwardHost: row.forwardHost ?? '',
            forwardPort: row.forwardPort ? String(row.forwardPort) : '',
        })
        setFieldErrors({})
        setMode('edit')
        setEditingId(row.id)
        setIsOpen(true)
    }, [])

    const close = useCallback(() => {
        setIsOpen(false)
    }, [])

    const setField = useCallback(<K extends keyof DomainForm>(key: K, value: DomainForm[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }, [])

    const setOption = useCallback((key: keyof NpmOptions, value: boolean) => {
        setForm((prev) => ({ ...prev, npmOptions: { ...prev.npmOptions, [key]: value } }))
    }, [])

    const submit = useCallback(async () => {
        setSubmitting(true)
        setFieldErrors({})

        try {
            if (mode === 'edit' && editingId) {
                const body: UpdateDomainBody = {
                    forwardScheme: form.forwardScheme,
                    forwardHost: form.forwardHost,
                    forwardPort: Number(form.forwardPort),
                }

                if (form.visibility === 'public') {
                    body.cfRecordType = form.cfRecordType
                    body.cfContent = form.cfContent || null
                    body.cfProxied = form.cfProxied
                }

                await api.updateDomain(editingId, body)

                pushToast('success', `${form.hostname} actualizado`)
            } else {
                const body: CreateDomainBody = {
                    hostname: form.hostname,
                    visibility: form.visibility,
                    forwardScheme: form.forwardScheme,
                    forwardHost: form.forwardHost,
                    forwardPort: Number(form.forwardPort),
                    npmOptions: form.npmOptions,
                }

                if (form.visibility === 'public') {
                    body.cfRecordType = form.cfRecordType
                    if (form.cfContent) {
                        body.cfContent = form.cfContent
                    }
                    body.cfProxied = form.cfProxied
                }

                await api.createDomain(body)

                pushToast('success', `${form.hostname} creado`)
            }

            setIsOpen(false)

            await refetch()
        } catch (error) {
            const apiError = error as ApiError
            
            if (apiError.status === 400 && apiError.fields) {
                setFieldErrors(apiError.fields)
            } else {
                pushToast('error', apiError.message)
            }
        } finally {
            setSubmitting(false)
        }
    }, [mode, editingId, form, pushToast, refetch])

    return {
        isOpen,
        mode,
        form,
        fieldErrors,
        submitting,
        openAdd,
        openClassify,
        openEdit,
        close,
        setField,
        setOption,
        submit,
    }
}

import { useCallback, useState } from 'preact/hooks'
import { api, type ApiError, type CreateDomainBody, type UpdateDomainBody } from '../lib/api'
import {
    DEFAULT_NPM_OPTIONS,
    type CfRecordType,
    type CustomLocation,
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
    customLocations: CustomLocation[]
    advancedConfig: string
    // 'new' = solicitar cert nuevo (LE); o el id (string) de un cert existente en NPM.
    certificateId: string
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
    customLocations: [],
    advancedConfig: '',
    certificateId: 'new',
    cfRecordType: 'A',
    cfContent: '',
    cfProxied: true,
})

const emptyLocation = (): CustomLocation => ({
    path: '/',
    forwardScheme: 'http',
    forwardHost: '',
    forwardPort: 80,
    advancedConfig: '',
})

interface CreateDeps {
    refetch: () => Promise<void>
    pushToast: (kind: ToastKind, message: string) => void
}

// Estado del modal de alta/clasificar/editar: formulario completo (mismos campos que NPM),
// errores por campo (del 400 `fields`) y envío. Editar prefilla todo desde la fila.
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
            npmOptions: { ...DEFAULT_NPM_OPTIONS, ...(row.npmOptions ?? {}) },
            customLocations: row.customLocations ?? [],
            advancedConfig: row.advancedConfig ?? '',
            certificateId: row.certificateId ? String(row.certificateId) : 'new',
            cfRecordType: row.cfRecordType ?? 'A',
            cfContent: row.cfContent ?? '',
            cfProxied: row.cfProxied,
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

    const addLocation = useCallback(() => {
        setForm((prev) => ({ ...prev, customLocations: [...prev.customLocations, emptyLocation()] }))
    }, [])

    const removeLocation = useCallback((index: number) => {
        setForm((prev) => ({ ...prev, customLocations: prev.customLocations.filter((_, i) => i !== index) }))
    }, [])

    const updateLocation = useCallback(
        <K extends keyof CustomLocation>(index: number, key: K, value: CustomLocation[K]) => {
            setForm((prev) => ({
                ...prev,
                customLocations: prev.customLocations.map((location, i) =>
                    i === index ? { ...location, [key]: value } : location,
                ),
            }))
        },
        [],
    )

    const submit = useCallback(async () => {
        setSubmitting(true)
        setFieldErrors({})

        try {
            if (mode === 'edit' && editingId) {
                const body: UpdateDomainBody = {
                    forwardScheme: form.forwardScheme,
                    forwardHost: form.forwardHost,
                    forwardPort: Number(form.forwardPort),
                    npmOptions: form.npmOptions,
                    customLocations: form.customLocations,
                    advancedConfig: form.advancedConfig,
                }

                if (form.visibility === 'public') {
                    body.certificateId = form.certificateId === 'new' ? null : Number(form.certificateId)
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
                    customLocations: form.customLocations,
                    advancedConfig: form.advancedConfig,
                }

                if (form.visibility === 'public') {
                    body.cfRecordType = form.cfRecordType
                    if (form.cfContent) {
                        body.cfContent = form.cfContent
                    }
                    body.cfProxied = form.cfProxied
                    body.certificateId = form.certificateId === 'new' ? 'new' : Number(form.certificateId)
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
        addLocation,
        removeLocation,
        updateLocation,
        submit,
    }
}

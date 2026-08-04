// Metadata de PRESENTACIÓN de las pestañas del formulario de alta/editar (sin lógica).
// `errorKeys` mapea las claves de error del 400 (`fields`) a la pestaña que las contiene,
// para: (a) badge de error en la pestaña y (b) saltar a la primera pestaña con error al fallar.

export type FormTabId = 'detalles' | 'opciones' | 'ubicaciones' | 'dns'

export interface FormTab {
    id: FormTabId
    label: string
    errorKeys: string[]
}

export const FORM_TABS: FormTab[] = [
    { id: 'detalles', label: 'Detalles', errorKeys: ['hostname', 'forwardHost', 'forwardPort'] },
    { id: 'opciones', label: 'Opciones', errorKeys: [] },
    { id: 'ubicaciones', label: 'Ubicaciones', errorKeys: [] },
    { id: 'dns', label: 'DNS y SSL', errorKeys: ['cfContent'] },
]

export function tabHasError(tab: FormTab, fieldErrors: Record<string, string>): boolean {
    return tab.errorKeys.some((key) => key in fieldErrors)
}

export function firstTabWithError(fieldErrors: Record<string, string>): FormTabId | null {
    return FORM_TABS.find((tab) => tabHasError(tab, fieldErrors))?.id ?? null
}

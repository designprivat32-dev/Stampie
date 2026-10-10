'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { saveBusinessCompanyAction } from '@/actions/business-cards'
import type { BusinessCompany } from '@/lib/business-cards/schema'
import { EditorSection } from './editor-section'

type CompanyForm = Record<keyof BusinessCompany, string>

const EMPTY: CompanyForm = { company: '', website: '', phone: '', street: '', postalCode: '', city: '' }

function toForm(company: BusinessCompany | null): CompanyForm {
  if (!company) return EMPTY
  return {
    company: company.company,
    website: company.website ?? '',
    phone: company.phone ?? '',
    street: company.street ?? '',
    postalCode: company.postalCode ?? '',
    city: company.city ?? '',
  }
}

/** Gilt für alle Personen der Karte: Firmenname, Website, Zentrale, Anschrift. */
export function CompanySection({ cardId, company }: { cardId: string; company: BusinessCompany | null }) {
  const router = useRouter()
  const [form, setForm] = React.useState<CompanyForm>(() => toForm(company))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const field = (key: keyof CompanyForm) => ({
    id: `company-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setSaved(false)
      setForm((f) => ({ ...f, [key]: e.target.value }))
    },
  })

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const result = await saveBusinessCompanyAction({ cardId, ...form })
      if (!result.success) {
        setErrors(result.error.fields ?? { company: result.error.message })
        return
      }
      setSaved(true)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <EditorSection title="Firmendaten" description="Stehen auf jeder Karte dieser Firma.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Firma" htmlFor="company-company" error={errors.company}>
          <Input {...field('company')} maxLength={120} placeholder="Nordlicht GmbH" />
        </Field>
        <Field label="Website" htmlFor="company-website" error={errors.website}>
          <Input {...field('website')} maxLength={500} placeholder="nordlicht.de" />
        </Field>
        <Field label="Telefon Zentrale" htmlFor="company-phone" error={errors.phone}>
          <Input {...field('phone')} maxLength={40} type="tel" />
        </Field>
        <Field label="Straße" htmlFor="company-street" error={errors.street}>
          <Input {...field('street')} maxLength={120} />
        </Field>
        <Field label="PLZ" htmlFor="company-postalCode" error={errors.postalCode}>
          <Input {...field('postalCode')} maxLength={12} />
        </Field>
        <Field label="Ort" htmlFor="company-city" error={errors.city}>
          <Input {...field('city')} maxLength={80} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={busy || !form.company.trim()} onClick={() => void save()}>
          {busy ? <Spinner /> : null}
          Firmendaten speichern
        </Button>
        {saved ? <p className="text-[12.5px] text-ok">Gespeichert.</p> : null}
      </div>
    </EditorSection>
  )
}

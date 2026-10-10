'use client'

import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import type { DraftCompany } from './editor-state'
import { EditorSection } from './editor-section'

/** Gilt für alle Personen der Karte: Firmenname, Website, Zentrale, Anschrift. */
export function CompanyPanel({
  company,
  onChange,
  errors,
}: {
  company: DraftCompany
  onChange: (patch: Partial<DraftCompany>) => void
  errors: Record<string, string>
}) {
  const field = (key: keyof DraftCompany) => ({
    id: `company-${key}`,
    value: company[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
  })
  const err = (key: keyof DraftCompany) => errors[`company.${key}`]

  return (
    <EditorSection title="Firma" description="Steht auf jeder Karte dieser Firma und im gespeicherten Kontakt.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Firmenname" htmlFor="company-company" error={err('company')}>
          <Input {...field('company')} maxLength={120} placeholder="Nordlicht GmbH" />
        </Field>
        <Field label="Website" htmlFor="company-website" error={err('website')}>
          <Input {...field('website')} maxLength={500} placeholder="nordlicht.de" inputMode="url" />
        </Field>
        <Field label="Telefon Zentrale" htmlFor="company-phone" error={err('phone')} hint="Erscheint nur bei Personen ohne eigene Nummer.">
          <Input {...field('phone')} maxLength={40} type="tel" placeholder="+49 40 123 456" />
        </Field>
        <Field label="Straße und Hausnummer" htmlFor="company-street" error={err('street')}>
          <Input {...field('street')} maxLength={120} />
        </Field>
        <div className="grid grid-cols-[110px_1fr] gap-3 sm:col-span-2 sm:max-w-md">
          <Field label="PLZ" htmlFor="company-postalCode" error={err('postalCode')}>
            <Input {...field('postalCode')} maxLength={12} inputMode="numeric" />
          </Field>
          <Field label="Ort" htmlFor="company-city" error={err('city')}>
            <Input {...field('city')} maxLength={80} />
          </Field>
        </div>
      </div>
    </EditorSection>
  )
}

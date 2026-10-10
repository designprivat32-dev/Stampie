'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createContactAction, updateContactAction } from '@/actions/business-cards'
import { MAX_CONTACT_LINKS, type BusinessContact } from '@/lib/business-cards/schema'

interface ContactForm {
  firstName: string
  lastName: string
  jobTitle: string
  phone: string
  mobile: string
  email: string
  links: Array<{ label: string; url: string }>
}

function toForm(contact: BusinessContact | null): ContactForm {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    jobTitle: contact?.jobTitle ?? '',
    phone: contact?.phone ?? '',
    mobile: contact?.mobile ?? '',
    email: contact?.email ?? '',
    links: contact?.links.map((l) => ({ ...l })) ?? [],
  }
}

/** Person anlegen oder bearbeiten. `contactId` null heißt: neu. */
export function ContactDialog({
  open,
  onOpenChange,
  cardId,
  contactId,
  contact,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  contactId: string | null
  contact: BusinessContact | null
}) {
  const router = useRouter()
  const [form, setForm] = React.useState<ContactForm>(() => toForm(contact))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(toForm(contact))
    setErrors({})
  }, [open, contact])

  const text = (key: Exclude<keyof ContactForm, 'links'>) => ({
    id: `contact-${key}`,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  const setLink = (index: number, patch: Partial<{ label: string; url: string }>) =>
    setForm((f) => ({ ...f, links: f.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))

  const submit = async () => {
    setBusy(true)
    setErrors({})
    try {
      const result = contactId
        ? await updateContactAction({ contactId, ...form })
        : await createContactAction({ cardId, ...form })
      if (!result.success) {
        setErrors(result.error.fields ?? { _: result.error.message })
        return
      }
      onOpenChange(false)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contactId ? 'Person bearbeiten' : 'Person hinzufügen'}</DialogTitle>
          <DialogDescription>
            Diese Angaben stehen auf der Visitenkarte und in „Kontakt speichern".
            {contactId ? ' Ausgegebene Karten aktualisieren sich von selbst.' : ''}
            {' '}Die Daten werden für jeden sichtbar, der den QR-Code scannt — nur mit Einverständnis
            der Person eintragen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vorname" htmlFor="contact-firstName" error={errors.firstName}>
            <Input {...text('firstName')} maxLength={80} />
          </Field>
          <Field label="Nachname" htmlFor="contact-lastName" error={errors.lastName}>
            <Input {...text('lastName')} maxLength={80} />
          </Field>
          <Field label="Position" htmlFor="contact-jobTitle" error={errors.jobTitle} className="sm:col-span-2">
            <Input {...text('jobTitle')} maxLength={120} placeholder="z. B. Vertrieb" />
          </Field>
          <Field label="Telefon (Durchwahl)" htmlFor="contact-phone" error={errors.phone}>
            <Input {...text('phone')} type="tel" maxLength={40} />
          </Field>
          <Field label="Mobil" htmlFor="contact-mobile" error={errors.mobile}>
            <Input {...text('mobile')} type="tel" maxLength={40} />
          </Field>
          <Field label="E-Mail" htmlFor="contact-email" error={errors.email} className="sm:col-span-2">
            <Input {...text('email')} type="email" maxLength={254} />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink">Weitere Links</p>
          {form.links.map((link, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                aria-label="Bezeichnung"
                placeholder="LinkedIn"
                value={link.label}
                maxLength={40}
                className="w-32"
                onChange={(e) => setLink(i, { label: e.target.value })}
              />
              <div className="flex-1 space-y-1">
                <Input
                  aria-label="Adresse"
                  placeholder="linkedin.com/in/…"
                  value={link.url}
                  maxLength={500}
                  onChange={(e) => setLink(i, { url: e.target.value })}
                />
                {errors[`links.${i}.url`] || errors[`links.${i}.label`] ? (
                  <p className="text-[12px] text-danger">{errors[`links.${i}.url`] ?? errors[`links.${i}.label`]}</p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Link entfernen"
                onClick={() => setForm((f) => ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
              >
                <X />
              </Button>
            </div>
          ))}
          {form.links.length < MAX_CONTACT_LINKS ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setForm((f) => ({ ...f, links: [...f.links, { label: '', url: '' }] }))}
            >
              <Plus />
              Link hinzufügen
            </Button>
          ) : null}
        </div>

        {errors._ ? (
          <p role="alert" className="text-[13px] text-danger">
            {errors._}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={busy || !form.firstName.trim() || !form.lastName.trim()}
            onClick={() => void submit()}
          >
            {busy ? <Spinner /> : null}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

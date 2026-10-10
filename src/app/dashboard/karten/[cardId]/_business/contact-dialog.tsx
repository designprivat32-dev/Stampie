'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Plus, X } from 'lucide-react'
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
import { uploadAssetAction } from '@/actions/assets'
import { ACCEPTED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'
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
  photo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardId: string
  contactId: string | null
  contact: BusinessContact | null
  /** Vorhandenes Foto der Person. */
  photo: { assetId: string; url: string | null } | null
}) {
  const router = useRouter()
  const [form, setForm] = React.useState<ContactForm>(() => toForm(contact))
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [photoState, setPhotoState] = React.useState(photo)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  // Auf die Werte geschaut, nicht auf das Objekt: der Aufrufer baut es bei jedem Rendern neu,
  // und ein Neuaufbau darf ein gerade hochgeladenes Foto nicht zurücksetzen.
  const photoId = photo?.assetId ?? null
  const photoUrl = photo?.url ?? null
  React.useEffect(() => {
    if (!open) return
    setForm(toForm(contact))
    setPhotoState(photoId ? { assetId: photoId, url: photoUrl } : null)
    setErrors({})
  }, [open, contact, photoId, photoUrl])

  const uploadPhoto = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors({ photo: 'Das Foto ist größer als 5 MB.' })
      return
    }
    setUploading(true)
    setErrors({})
    try {
      const data = new FormData()
      data.set('cardId', cardId)
      data.set('kind', 'CONTACT_PHOTO')
      data.set('file', file)
      const result = await uploadAssetAction(data)
      if (!result.success) {
        setErrors({ photo: result.error.message })
        return
      }
      setPhotoState({ assetId: result.data.id, url: result.data.url })
    } finally {
      setUploading(false)
    }
  }

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
        ? await updateContactAction({ contactId, ...form, photoAssetId: photoState?.assetId ?? null })
        : await createContactAction({ cardId, ...form, photoAssetId: photoState?.assetId ?? null })
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

        <div className="flex items-center gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2">
            {photoState?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoState.url} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-5 text-ink-3" />
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_UPLOAD_MIME}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void uploadPhoto(file)
                e.target.value = ''
              }}
            />
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Spinner /> : null}
                {photoState ? 'Foto ersetzen' : 'Foto hochladen'}
              </Button>
              {photoState ? (
                <Button variant="ghost" size="sm" onClick={() => setPhotoState(null)}>
                  Entfernen
                </Button>
              ) : null}
            </div>
            <p className="text-[12px] text-ink-3">Optional. Wird quadratisch zugeschnitten.</p>
            {errors.photo ? <p className="text-[12px] text-danger">{errors.photo}</p> : null}
          </div>
        </div>

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
            disabled={busy || uploading || !form.firstName.trim() || !form.lastName.trim()}
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

'use client'

import * as React from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { uploadAssetAction } from '@/actions/assets'
import { MAX_CONTACT_LINKS } from '@/lib/business-cards/schema'
import { ACCEPTED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '@/lib/images/upload-constraints'
import type { DraftContact } from './editor-state'

type TextKey = 'firstName' | 'lastName' | 'jobTitle' | 'phone' | 'mobile' | 'email'

/** Die Felder einer Person, direkt in der Liste statt in einem eigenen Dialog. */
export function PersonForm({
  cardId,
  index,
  contact,
  onChange,
  errors,
}: {
  cardId: string
  /** Position in der Liste — die Fehlerpfade vom Server lauten `contacts.<index>.<feld>`. */
  index: number
  contact: DraftContact
  onChange: (patch: Partial<DraftContact>) => void
  errors: Record<string, string>
}) {
  const [uploading, setUploading] = React.useState(false)
  const [photoError, setPhotoError] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const err = (path: string) => errors[`contacts.${index}.${path}`]
  const id = (key: string) => `person-${contact.key}-${key}`

  const text = (key: TextKey) => ({
    id: id(key),
    value: contact[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value }),
  })

  const uploadPhoto = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setPhotoError('Das Foto ist größer als 5 MB.')
      return
    }
    setUploading(true)
    setPhotoError(null)
    try {
      const data = new FormData()
      data.set('cardId', cardId)
      data.set('kind', 'CONTACT_PHOTO')
      data.set('file', file)
      const result = await uploadAssetAction(data)
      if (!result.success) {
        setPhotoError(result.error.message)
        return
      }
      onChange({ photoAssetId: result.data.id, photoUrl: result.data.url })
    } finally {
      setUploading(false)
    }
  }

  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    onChange({ links: contact.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) })

  return (
    <div className="space-y-4 pb-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 hover:border-ink-3"
          aria-label="Foto hochladen"
        >
          {uploading ? (
            <Spinner />
          ) : contact.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={contact.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-5 text-ink-3" />
          )}
        </button>
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
        <div className="space-y-1">
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {contact.photoAssetId ? 'Foto ersetzen' : 'Foto hochladen'}
            </Button>
            {contact.photoAssetId ? (
              <Button variant="ghost" size="sm" onClick={() => onChange({ photoAssetId: null, photoUrl: null })}>
                Entfernen
              </Button>
            ) : null}
          </div>
          <p className="text-[12px] text-ink-3">Optional — erscheint rund im Banner der Karte.</p>
          {photoError ?? err('photoAssetId') ? (
            <p className="text-[12px] text-danger">{photoError ?? err('photoAssetId')}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vorname" htmlFor={id('firstName')} error={err('firstName')}>
          <Input {...text('firstName')} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Nachname" htmlFor={id('lastName')} error={err('lastName')}>
          <Input {...text('lastName')} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Position" htmlFor={id('jobTitle')} error={err('jobTitle')} className="sm:col-span-2">
          <Input {...text('jobTitle')} maxLength={120} placeholder="z. B. Vertrieb" />
        </Field>
        <Field label="Telefon (Durchwahl)" htmlFor={id('phone')} error={err('phone')}>
          <Input {...text('phone')} type="tel" maxLength={40} />
        </Field>
        <Field label="Mobil" htmlFor={id('mobile')} error={err('mobile')}>
          <Input {...text('mobile')} type="tel" maxLength={40} />
        </Field>
        <Field label="E-Mail" htmlFor={id('email')} error={err('email')} className="sm:col-span-2">
          <Input {...text('email')} type="email" maxLength={254} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-[12.5px] font-medium text-ink">Weitere Links</p>
        {contact.links.map((link, i) => (
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
              {err(`links.${i}.url`) ?? err(`links.${i}.label`) ? (
                <p className="text-[12px] text-danger">{err(`links.${i}.url`) ?? err(`links.${i}.label`)}</p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Link entfernen"
              onClick={() => onChange({ links: contact.links.filter((_, j) => j !== i) })}
            >
              <X />
            </Button>
          </div>
        ))}
        {contact.links.length < MAX_CONTACT_LINKS ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({ links: [...contact.links, { label: '', url: '' }] })}>
            <Plus />
            Link hinzufügen
          </Button>
        ) : null}
      </div>

      <p className="text-[11.5px] leading-snug text-ink-3">
        Diese Angaben sieht jeder, der den QR-Code scannt — nur mit Einverständnis der Person eintragen.
      </p>
    </div>
  )
}

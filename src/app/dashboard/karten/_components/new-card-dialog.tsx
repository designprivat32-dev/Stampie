'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Stamp, Ticket, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Spinner } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCardAction } from '@/actions/cards'
import { CARD_TEMPLATES } from '@/lib/cards/templates'
import { cn } from '@/lib/utils'
import type { CardKind } from '@/lib/cards/schema'
import type { CustomerOption } from '@/lib/cards/card-service'

const NO_CUSTOMER = '__none__'
const NO_TEMPLATE = '__none__'

const CARD_KIND_OPTIONS: ReadonlyArray<{
  value: CardKind
  label: string
  description: string
  icon: LucideIcon
}> = [
  {
    value: 'STAMP',
    label: 'Stempelkarte',
    description: 'Kunde sammelt Stempel und bekommt eine Belohnung.',
    icon: Stamp,
  },
  {
    value: 'COUPON',
    label: 'Gutscheinkarte',
    description: 'Einmaliger Rabatt, wird an der Kasse eingelöst.',
    icon: Ticket,
  },
]

/**
 * Creates the card, then goes straight into the designer — "erst Übersicht, dann das Tool".
 * Everything here is optional except the name; a card can be designed long before anyone
 * decides which customer gets it.
 */
export function NewCardDialog({
  open,
  onOpenChange,
  customers,
  canChooseCustomer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: CustomerOption[]
  canChooseCustomer: boolean
}) {
  const router = useRouter()
  const [name, setName] = React.useState('')
  const [kind, setKind] = React.useState<CardKind>('STAMP')
  const [orgId, setOrgId] = React.useState<string>(NO_CUSTOMER)
  const [templateId, setTemplateId] = React.useState<string>(NO_TEMPLATE)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName('')
    setKind('STAMP')
    setOrgId(canChooseCustomer ? NO_CUSTOMER : (customers[0]?.id ?? NO_CUSTOMER))
    setTemplateId(NO_TEMPLATE)
    setError(null)
  }, [open, canChooseCustomer, customers])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await createCardAction({
        name: name.trim(),
        kind,
        orgId: orgId === NO_CUSTOMER ? null : orgId,
        templateId: templateId === NO_TEMPLATE ? null : templateId,
      })
      if (!result.success) {
        setError(result.error.message)
        return
      }
      onOpenChange(false)
      router.push(`/dashboard/karten/${result.data.cardId}`)
    } catch {
      setError('Die Karte konnte nicht angelegt werden. Bitte erneut versuchen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Karte</DialogTitle>
          <DialogDescription>
            Nach dem Anlegen geht es direkt in den Designer. Der Kunde lässt sich jederzeit
            nachtragen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/*
            First choice, and a one-way door: the wallet pass type follows from it and is
            baked into every pass a customer saves, so there is no way back afterwards.
            Saying so here is cheaper than an error message later.
          */}
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Was für eine Karte?</legend>
            <div className="grid grid-cols-2 gap-2">
              {CARD_KIND_OPTIONS.map((option) => {
                const selected = kind === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setKind(option.value)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors',
                      selected
                        ? 'border-accent bg-accent/10'
                        : 'border-line bg-surface hover:border-ink-3',
                    )}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium">
                      <option.icon className="size-4 shrink-0" />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[12px] leading-snug text-ink-3">
                      {option.description}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Lässt sich später nicht mehr ändern — der Typ steckt in jedem ausgegebenen Pass.
            </p>
          </fieldset>

          <Field label="Name der Karte" htmlFor="card-name" hint="Nur intern sichtbar.">
            <Input
              id="card-name"
              value={name}
              maxLength={60}
              placeholder={kind === 'COUPON' ? 'Sommeraktion Café Nord' : 'Kaffeekarte Café Nord'}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void submit()
              }}
            />
          </Field>

          {canChooseCustomer ? (
            <Field label="Kunde" htmlFor="card-org" hint="Bestimmt, wer stempeln darf.">
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger id="card-org">
                  <SelectValue placeholder="Noch nicht zuweisen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Noch nicht zuweisen</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {/* Templates carry stamp goals, icons and reward texts — nothing a coupon uses. */}
          {kind === 'STAMP' ? (
            <Field label="Vorlage" htmlFor="card-template" hint="Setzt Farben, Symbol und Texte.">
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="card-template">
                  <SelectValue placeholder="Ohne Vorlage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Ohne Vorlage</SelectItem>
                  {CARD_TEMPLATES.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.badge} {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="primary" disabled={busy || name.trim().length === 0} onClick={submit}>
            {busy ? <Spinner /> : null}
            Anlegen und gestalten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

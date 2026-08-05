'use client'

import * as React from 'react'
import { AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { PanelSection, TabPanel } from '@/components/ui/misc'
import { BackFieldsEditor } from '../back-fields-editor'
import { PlatformSupportBadge } from '../platform-support-badge'
import { newFieldId } from '@/lib/cards/defaults'
import { LEGAL_LABELS, type BackField } from '@/lib/cards/schema'
import { formatAddress, formatOpeningHours, type LocationSummary } from '@/types/location'
import { useCardEditor } from '@/stores/card-editor-provider'

export function TextsTab({ location }: { location: LocationSummary }) {
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)
  const addBackField = useCardEditor((s) => s.addBackField)

  const existingTypes = new Set(design.backFields.map((f) => f.label.toLowerCase()))
  const legalKinds = new Set(design.backFields.filter((f) => f.type === 'legal').map((f) => f.kind))

  const prefills = React.useMemo(() => {
    const items: Array<{ key: string; label: string; build: () => BackField | null }> = [
      {
        key: 'address',
        label: 'Adresse',
        build: () => {
          const value = formatAddress(location)
          return value ? { id: newFieldId(), type: 'address', label: 'Adresse', value } : null
        },
      },
      {
        key: 'hours',
        label: 'Öffnungszeiten',
        build: () => {
          const value = formatOpeningHours(location.openingHours)
          return value ? { id: newFieldId(), type: 'hours', label: 'Öffnungszeiten', value } : null
        },
      },
      {
        key: 'phone',
        label: 'Telefon',
        build: () =>
          location.phone
            ? { id: newFieldId(), type: 'phone', label: 'Telefon', value: location.phone }
            : null,
      },
      {
        key: 'website',
        label: 'Website',
        build: () =>
          location.website
            ? { id: newFieldId(), type: 'url', label: 'Website', value: location.website }
            : null,
      },
    ]
    return items.filter((i) => i.build() !== null)
  }, [location])

  const missingLegal = (['imprint', 'privacy'] as const).filter((k) => !legalKinds.has(k))

  return (
    <TabPanel>
      <PanelSection title="Kartentexte">
        <div className="space-y-4">
          <Field
            label="Programmname"
            htmlFor="program-name"
            hint="Erscheint als Titel der Karte. Pflichtfeld zum Veröffentlichen."
          >
            <Input
              id="program-name"
              value={design.programName}
              maxLength={30}
              placeholder="Kaffeekarte"
              onChange={(e) => patch({ programName: e.target.value })}
            />
          </Field>

          <Field
            label="Kartenüberschrift"
            htmlFor="card-title"
            hint="Optional. Kleine Zeile neben dem Logo."
            action={<PlatformSupportBadge field="cardTitle" />}
          >
            <Input
              id="card-title"
              value={design.cardTitle ?? ''}
              maxLength={40}
              placeholder="Kaffee sammeln"
              onChange={(e) => patch({ cardTitle: e.target.value || null })}
            />
          </Field>

          <Field
            label="Label für den Stempelstand"
            htmlFor="stamp-label"
            hint={'Steht über der Zahl, z. B. „Kaffee“ oder „Besuche“.'}
          >
            <Input
              id="stamp-label"
              value={design.stampLabel}
              maxLength={16}
              placeholder="Stempel"
              onChange={(e) => patch({ stampLabel: e.target.value })}
            />
          </Field>
        </div>
      </PanelSection>

      <PanelSection
        title="Rückseite"
        description="Reihenfolge per Drag & Drop oder mit der Tastatur (Leertaste, dann Pfeiltasten)."
        action={<PlatformSupportBadge field="backFields" />}
      >
        <div className="space-y-3">
          {prefills.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
              <p className="text-[12px] font-medium text-ink">Aus den Stammdaten übernehmen</p>
              <div className="flex flex-wrap gap-1.5">
                {prefills.map((item) => (
                  <Button
                    key={item.key}
                    variant="outline"
                    size="sm"
                    className="bg-surface"
                    disabled={existingTypes.has(item.label.toLowerCase())}
                    onClick={() => {
                      const field = item.build()
                      if (field) addBackField(field)
                    }}
                  >
                    <Plus />
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <BackFieldsEditor />
        </div>
      </PanelSection>

      <PanelSection
        title="Pflichtangaben"
        description="Deutsche Rechtslage — ohne diese Links ist Veröffentlichen gesperrt."
      >
        {missingLegal.length === 0 ? (
          <p className="rounded-md border border-ok/30 bg-ok-soft px-3 py-2 text-[12px] text-ok">
            Impressum und Datenschutz sind hinterlegt.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] leading-snug text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Es {missingLegal.length === 1 ? 'fehlt' : 'fehlen'}:{' '}
              {missingLegal.map((k) => LEGAL_LABELS[k]).join(' und ')}.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {missingLegal.map((kind) => {
                const suggested = kind === 'imprint' ? location.imprintUrl : location.privacyUrl
                return (
                  <Button
                    key={kind}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      addBackField({
                        id: newFieldId(),
                        type: 'legal',
                        kind,
                        label: LEGAL_LABELS[kind],
                        value: suggested ?? '',
                      })
                    }
                  >
                    <Plus />
                    {LEGAL_LABELS[kind]}-Link hinzufügen
                  </Button>
                )
              })}
            </div>
          </div>
        )}
      </PanelSection>
    </TabPanel>
  )
}

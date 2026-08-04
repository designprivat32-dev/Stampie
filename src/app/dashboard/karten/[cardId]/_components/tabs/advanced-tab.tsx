'use client'

import { Input } from '@/components/ui/input'
import { Field, Label } from '@/components/ui/label'
import { PanelSection } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { GeoLocationsEditor } from '../geo-locations-editor'
import { PlatformSupportBadge } from '../platform-support-badge'
import { BARCODE_FORMATS, type BarcodeFormat } from '@/lib/cards/schema'
import type { LocationSummary } from '@/types/location'
import { useCardEditor } from '@/stores/card-editor-provider'

const BARCODE_LABELS: Record<BarcodeFormat, string> = {
  QR: 'QR-Code (Standard)',
  CODE128: 'Code 128',
  PDF417: 'PDF417',
  AZTEC: 'Aztec',
}

export function AdvancedTab({ location }: { location: LocationSummary }) {
  const design = useCardEditor((s) => s.design)
  const patch = useCardEditor((s) => s.patch)

  const expiresValue = design.expiresAt ? toDateInputValue(design.expiresAt) : ''

  return (
    <div>
      <PanelSection
        title="Barcode"
        description="Wird beim Stempeln im Laden gescannt."
        action={<PlatformSupportBadge field={design.barcodeFormat === 'QR' ? 'barcodeQr' : 'barcodeOther'} />}
      >
        <Field label="Format" htmlFor="barcode-format">
          <Select
            value={design.barcodeFormat}
            onValueChange={(value) => patch({ barcodeFormat: value as BarcodeFormat })}
          >
            <SelectTrigger id="barcode-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BARCODE_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {BARCODE_LABELS[format]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </PanelSection>

      <PanelSection
        title="Standort-Benachrichtigung"
        description="Die Karte erscheint automatisch auf dem Sperrbildschirm, wenn der Kunde in der Nähe ist."
        action={<PlatformSupportBadge field="geoLocations" />}
      >
        <GeoLocationsEditor location={location} />
      </PanelSection>

      <PanelSection title="Gültigkeit">
        <Field
          label="Gültig bis"
          htmlFor="expires-at"
          hint="Leer lassen für unbegrenzte Gültigkeit."
        >
          <Input
            id="expires-at"
            type="date"
            value={expiresValue}
            min={toDateInputValue(new Date())}
            onChange={(e) =>
              patch({ expiresAt: e.target.value ? new Date(`${e.target.value}T23:59:59`) : null })
            }
          />
        </Field>
      </PanelSection>

      <PanelSection title="Teilen">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-3">
          <div className="min-w-0">
            <Label htmlFor="shareable">Karte teilbar</Label>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-3">
              Erlaubt es Kunden, die Karte an andere weiterzugeben. Für Treueprogramme meist
              unerwünscht.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PlatformSupportBadge field="shareable" />
            <Switch
              id="shareable"
              checked={design.shareable}
              onCheckedChange={(shareable) => patch({ shareable })}
            />
          </div>
        </div>
      </PanelSection>
    </div>
  )
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

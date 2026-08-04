'use client'

import { MapPin, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { newFieldId } from '@/lib/cards/defaults'
import { MAX_GEO_LOCATIONS } from '@/lib/cards/schema'
import type { LocationSummary } from '@/types/location'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Geo notifications. Apple allows at most 10 locations per pass, so the add button is
 * hard-capped here as well as in the schema.
 *
 * Coordinates are entered numerically and can be taken from the location's master data
 * with one click. A draggable map would need an external tile provider, which is a
 * decision for the platform, not for this panel — the "Standort übernehmen" button covers
 * the case that actually occurs (the shop itself).
 */
export function GeoLocationsEditor({ location }: { location: LocationSummary }) {
  const geoLocations = useCardEditor((s) => s.design.geoLocations)
  const addGeoLocation = useCardEditor((s) => s.addGeoLocation)
  const updateGeoLocation = useCardEditor((s) => s.updateGeoLocation)
  const removeGeoLocation = useCardEditor((s) => s.removeGeoLocation)

  const atLimit = geoLocations.length >= MAX_GEO_LOCATIONS
  const hasCoordinates = location.latitude !== null && location.longitude !== null

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {geoLocations.map((geo) => (
          <li key={geo.id} className="space-y-3 rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-ink-3" />
              <Input
                className="h-8 text-[13px]"
                value={geo.label}
                maxLength={60}
                aria-label="Bezeichnung des Standorts"
                placeholder="Filiale Innenstadt"
                onChange={(e) => updateGeoLocation(geo.id, { label: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${geo.label || 'Standort'} entfernen`}
                onClick={() => removeGeoLocation(geo.id)}
              >
                <Trash2 />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor={`lat-${geo.id}`} className="text-[11px] text-ink-3">
                  Breitengrad
                </Label>
                <Input
                  id={`lat-${geo.id}`}
                  className="h-8 font-mono text-[12px]"
                  inputMode="decimal"
                  value={String(geo.latitude)}
                  onChange={(e) =>
                    updateGeoLocation(geo.id, { latitude: clamp(Number(e.target.value), -90, 90) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`lng-${geo.id}`} className="text-[11px] text-ink-3">
                  Längengrad
                </Label>
                <Input
                  id={`lng-${geo.id}`}
                  className="h-8 font-mono text-[12px]"
                  inputMode="decimal"
                  value={String(geo.longitude)}
                  onChange={(e) =>
                    updateGeoLocation(geo.id, { longitude: clamp(Number(e.target.value), -180, 180) })
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor={`radius-${geo.id}`} className="text-[11px] text-ink-3">
                  Radius
                </Label>
                <span className="text-[12px] tabular-nums text-ink-2">{geo.maxDistance} m</span>
              </div>
              <Slider
                id={`radius-${geo.id}`}
                min={10}
                max={5000}
                step={10}
                value={[geo.maxDistance]}
                onValueChange={([next]) => updateGeoLocation(geo.id, { maxDistance: next ?? 100 })}
                aria-label="Radius in Metern"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={`text-${geo.id}`} className="text-[11px] text-ink-3">
                Hinweistext auf dem Sperrbildschirm
              </Label>
              <Input
                id={`text-${geo.id}`}
                className="h-8 text-[13px]"
                value={geo.relevantText}
                maxLength={60}
                placeholder="Deine Stempelkarte ist bereit"
                onChange={(e) => updateGeoLocation(geo.id, { relevantText: e.target.value })}
              />
            </div>
          </li>
        ))}
      </ul>

      {geoLocations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-3">
          Keine Standorte hinterlegt. Ohne Standort erscheint die Karte nicht automatisch auf dem
          Sperrbildschirm.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={atLimit}
          onClick={() =>
            addGeoLocation({
              id: newFieldId(),
              label: location.name,
              latitude: location.latitude ?? 52.520008,
              longitude: location.longitude ?? 13.404954,
              maxDistance: 150,
              relevantText: 'Deine Stempelkarte ist bereit',
            })
          }
        >
          <Plus />
          {hasCoordinates ? 'Standort des Betriebs übernehmen' : 'Standort hinzufügen'}
        </Button>
        <span className="text-[12px] text-ink-3">
          {geoLocations.length} / {MAX_GEO_LOCATIONS}
        </span>
      </div>

      {atLimit ? (
        <p className="text-[12px] text-warn-ink">
          Apple Wallet erlaubt höchstens {MAX_GEO_LOCATIONS} Standorte pro Karte.
        </p>
      ) : null}
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

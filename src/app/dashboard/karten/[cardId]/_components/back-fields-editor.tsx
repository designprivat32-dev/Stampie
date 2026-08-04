'use client'

import * as React from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { newFieldId } from '@/lib/cards/defaults'
import { LEGAL_LABELS, MAX_BACK_FIELDS, type BackField, type LegalKind } from '@/lib/cards/schema'
import { useCardEditor } from '@/stores/card-editor-provider'

/**
 * Sortable list of back-of-card fields.
 *
 * dnd-kit's keyboard sensor is wired up deliberately: reordering has to work without a
 * mouse, and on the iPad the agency uses, pointer dragging is the only other option.
 */

const TYPE_LABELS: Record<BackField['type'], string> = {
  text: 'Text',
  url: 'Website',
  phone: 'Telefon',
  address: 'Adresse',
  hours: 'Öffnungszeiten',
  legal: 'Rechtliches',
}

const MULTILINE_TYPES: ReadonlySet<BackField['type']> = new Set(['text', 'address', 'hours'])

export function BackFieldsEditor() {
  const backFields = useCardEditor((s) => s.design.backFields)
  const addBackField = useCardEditor((s) => s.addBackField)
  const updateBackField = useCardEditor((s) => s.updateBackField)
  const removeBackField = useCardEditor((s) => s.removeBackField)
  const reorderBackFields = useCardEditor((s) => s.reorderBackFields)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    reorderBackFields(String(active.id), String(over.id))
  }

  const atLimit = backFields.length >= MAX_BACK_FIELDS

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={backFields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {backFields.map((field) => (
              <SortableField
                key={field.id}
                field={field}
                onChange={(patch) => updateBackField(field.id, patch)}
                onRemove={() => removeBackField(field.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {backFields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[12px] text-ink-3">
          Noch keine Felder. Adresse, Öffnungszeiten und Kontakt lassen sich unten übernehmen.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={atLimit}
          onClick={() =>
            addBackField({ id: newFieldId(), type: 'text', label: 'Hinweis', value: '' })
          }
        >
          <Plus />
          Feld hinzufügen
        </Button>
        {atLimit ? (
          <span className="self-center text-[12px] text-ink-3">
            Maximal {MAX_BACK_FIELDS} Felder.
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SortableField({
  field,
  onChange,
  onRemove,
}: {
  field: BackField
  onChange: (patch: Partial<BackField>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
  })

  const labelId = `field-label-${field.id}`
  const valueId = `field-value-${field.id}`

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-line bg-surface p-3 ${isDragging ? 'z-10 shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          data-slot="control"
          className="mt-1 cursor-grab rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
          aria-label={`${field.label} verschieben`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Select
              value={field.type}
              onValueChange={(next) => onChange(changeType(field, next as BackField['type']))}
            >
              <SelectTrigger className="h-8 w-[150px] text-[12px]" aria-label="Feldtyp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as BackField['type'][]).map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {field.type === 'legal' ? (
              <Select
                value={field.kind}
                onValueChange={(next) => onChange({ kind: next as LegalKind } as Partial<BackField>)}
              >
                <SelectTrigger className="h-8 w-[130px] text-[12px]" aria-label="Art">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEGAL_LABELS) as LegalKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {LEGAL_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {field.type === 'url' || field.type === 'phone' ? (
              <Badge tone="neutral">Link-Modul</Badge>
            ) : null}

            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              aria-label={`${field.label} entfernen`}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
            <div className="space-y-1">
              <Label htmlFor={labelId} className="text-[11px] text-ink-3">
                Bezeichnung
              </Label>
              <Input
                id={labelId}
                className="h-8 text-[13px]"
                value={field.label}
                maxLength={40}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor={valueId} className="text-[11px] text-ink-3">
                Inhalt
              </Label>
              {MULTILINE_TYPES.has(field.type) ? (
                <Textarea
                  id={valueId}
                  className="min-h-[60px] text-[13px]"
                  value={field.value}
                  maxLength={500}
                  onChange={(e) => onChange({ value: e.target.value })}
                />
              ) : (
                <Input
                  id={valueId}
                  className="h-8 text-[13px]"
                  value={field.value}
                  maxLength={500}
                  inputMode={field.type === 'phone' ? 'tel' : 'url'}
                  placeholder={field.type === 'phone' ? '+49 30 1234567' : 'https://…'}
                  onChange={(e) => onChange({ value: e.target.value })}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * Switching type has to produce a *valid* member of the union — a legal field needs a
 * `kind`, and everything else must not carry one.
 */
function changeType(field: BackField, type: BackField['type']): Partial<BackField> {
  if (type === 'legal') {
    return { type, kind: 'imprint', label: field.label || 'Impressum' } as Partial<BackField>
  }
  return { type, kind: undefined } as unknown as Partial<BackField>
}

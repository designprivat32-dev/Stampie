'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HEX_COLOR_RE } from '@/lib/cards/schema'
import { cn } from '@/lib/utils'

/**
 * Colour control: native picker plus a hex field.
 *
 * The hex field is the keyboard fallback — the native swatch is not reliably operable
 * without a mouse, and a shop owner pasting the hex from their brand sheet is the common
 * case anyway. Local state lets the user type a partial value without the store rejecting
 * it mid-keystroke; the design only updates once the value is a valid colour.
 */
export function ColorField({
  id,
  label,
  value,
  onChange,
  badge,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  badge?: React.ReactNode
  hint?: React.ReactNode
}) {
  const [text, setText] = React.useState(value)
  const [focused, setFocused] = React.useState(false)

  // Keep in sync with outside changes (palette click, template, undo) while not typing.
  React.useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  const commit = (raw: string) => {
    const next = raw.startsWith('#') ? raw : `#${raw}`
    if (HEX_COLOR_RE.test(next)) onChange(next.toLowerCase())
  }

  const invalid = text.length > 0 && !HEX_COLOR_RE.test(text.startsWith('#') ? text : `#${text}`)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {badge}
      </div>

      <div className="flex items-center gap-2">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-md border border-line">
          <input
            type="color"
            aria-label={`${label} — Farbwähler`}
            value={HEX_COLOR_RE.test(value) ? value : '#000000'}
            onChange={(e) => {
              setText(e.target.value)
              onChange(e.target.value.toLowerCase())
            }}
            data-slot="control"
            className="absolute -left-1 -top-1 size-11 cursor-pointer border-0 bg-transparent p-0"
          />
        </span>

        <Input
          id={id}
          value={text}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            commit(text)
            setText(value)
          }}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          className={cn('font-mono text-[13px] uppercase', invalid && 'border-danger')}
          placeholder="#1a1a1a"
        />
      </div>

      {invalid ? (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-danger">
          Bitte im Format #rrggbb angeben.
        </p>
      ) : hint ? (
        <p className="text-[12px] leading-snug text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

/** One-click palette extracted from the uploaded logo. */
export function PaletteRow({
  colors,
  onPick,
}: {
  colors: readonly string[]
  onPick: (color: string) => void
}) {
  if (colors.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          data-slot="control"
          onClick={() => onPick(color)}
          title={color}
          aria-label={`Farbe ${color} übernehmen`}
          className="size-7 rounded-md border border-line transition-transform hover:scale-110"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  )
}

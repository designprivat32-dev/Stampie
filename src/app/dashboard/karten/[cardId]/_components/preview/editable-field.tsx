'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Click-to-edit text used directly on the Google Wallet preview, mirroring how Google's own
 * Pass Builder lets you select a field on the mock pass and type into it in place — no
 * detour through a sidebar form. Every keystroke commits immediately via `onCommit`, same
 * as the existing sidebar inputs, so undo/redo behaves identically either way.
 */
export function EditableField({
  value,
  placeholder,
  maxLength,
  onCommit,
  tone,
  className,
  ariaLabel,
  truncate = true,
}: {
  value: string
  placeholder: string
  maxLength: number
  onCommit: (value: string) => void
  /** Matches the card's derived text colour so the edit affordance stays visible on it. */
  tone: 'light' | 'dark'
  className?: string
  ariaLabel: string
  /** Off for longer fields (e.g. reward text) that are meant to wrap, not clip. */
  truncate?: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onCommit(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
        }}
        className={cn(
          'min-w-0 rounded-sm px-1 outline-none ring-2',
          tone === 'light' ? 'bg-white/15 ring-white/70' : 'bg-black/10 ring-black/50',
          className,
        )}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className={cn(
        '-mx-1 block max-w-full rounded-sm px-1 text-left outline-dashed outline-1 outline-transparent transition-colors',
        truncate ? 'truncate' : 'whitespace-normal',
        tone === 'light' ? 'hover:outline-white/50' : 'hover:outline-black/35',
        !value && 'italic opacity-60',
        className,
      )}
    >
      {value || placeholder}
    </button>
  )
}

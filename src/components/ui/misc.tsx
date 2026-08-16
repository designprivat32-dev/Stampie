'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

// ------------------------------------------------------------------ tooltip

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-72 rounded-md bg-ink px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-md"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/**
 * An explanation folded into a hoverable mark.
 *
 * Every hint used to sit on screen as its own grey line under a heading or a field. Read
 * once, ignored forever, and together they made a form of eight controls look like a
 * manual. The text is still there for whoever wants it — it just no longer competes with
 * the thing it describes.
 *
 * The button element is deliberate: Radix opens the tooltip on focus too, so the text
 * stays reachable without a mouse.
 *
 * It brings its own provider. `Field` is used in dialogs that have none, and a Radix
 * tooltip without one throws — a hint on a form field must not be able to take a dialog
 * down. Nested providers are supported and cost nothing but context.
 */
export function InfoHint({ children }: { children: React.ReactNode }) {
  if (!children) return null

  return (
    <TooltipProvider>
      <Tooltip content={children}>
        <button
          type="button"
          aria-label="Hinweis"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold leading-none text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
        >
          i
        </button>
      </Tooltip>
    </TooltipProvider>
  )
}

// ------------------------------------------------------------------ popover

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn('z-50 rounded-lg border border-line bg-surface p-3 shadow-lg outline-none', className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = 'PopoverContent'

// ------------------------------------------------------------------ radio group

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
))
RadioGroup.displayName = 'RadioGroup'

/** Card-style radio the whole surface of which is clickable and keyboard reachable. */
export const RadioCard = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & { label: string; hint?: string }
>(({ className, label, hint, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    data-slot="control"
    className={cn(
      'flex flex-col items-start rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors',
      'hover:border-line-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft',
      className,
    )}
    {...props}
  >
    <span className="text-[13px] font-medium text-ink">{label}</span>
    {hint ? <span className="text-[11px] text-ink-3">{hint}</span> : null}
  </RadioGroupPrimitive.Item>
))
RadioCard.displayName = 'RadioCard'

// ------------------------------------------------------------------ small bits

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'neutral' | 'warn' | 'danger' | 'ok' | 'accent' }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    warn: 'bg-warn-soft text-warn-ink border-warn/40',
    danger: 'bg-danger-soft text-danger border-danger/30',
    ok: 'bg-ok-soft text-ok border-ok/30',
    accent: 'bg-accent-soft text-accent border-accent/30',
  } as const
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />
}

export function PanelSection({
  title,
  description,
  children,
  action,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="space-y-3 border-b border-line px-5 py-5 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h3>
          <InfoHint>{description}</InfoHint>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('size-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

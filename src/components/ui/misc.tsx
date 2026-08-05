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

/**
 * Column shell for an editor tab.
 *
 * CSS multi-column, not a grid: the sections differ wildly in height, and columns balance
 * them, where grid rows would all be as tall as their tallest cell. Column count follows the
 * width on its own — one on a phone, three on a wide desktop — so the settings fill the
 * screen instead of running off the bottom of it.
 */
export function TabPanel({ children }: { children: React.ReactNode }) {
  // 20rem is a floor, not a preference: below roughly 19rem the upload rows and colour fields
  // start wrapping, and a section that wraps is taller than the column it saved.
  return <div className="columns-[20rem] gap-2.5 [column-fill:balance]">{children}</div>
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
    // A self-contained card: full-bleed dividers cannot work once sections sit side by side.
    <section className="mb-2.5 space-y-2.5 break-inside-avoid rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">{title}</h3>
          {description ? <p className="text-[12px] leading-snug text-ink-3">{description}</p> : null}
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

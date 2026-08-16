'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { InfoHint } from './misc'
import { cn } from '@/lib/utils'

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-[13px] font-medium leading-none text-ink', className)}
    {...props}
  />
))
Label.displayName = 'Label'

export function FieldHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[12px] leading-snug text-ink-3', className)}>{children}</p>
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-[12px] leading-snug text-danger">
      {children}
    </p>
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  action,
}: {
  label: string
  hint?: React.ReactNode
  error?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={htmlFor}>{label}</Label>
          <InfoHint>{hint}</InfoHint>
        </div>
        {action}
      </div>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  )
}

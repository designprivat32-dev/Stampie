import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="control"
      className={cn(
        'flex h-9 w-full rounded-md border border-line bg-surface px-3 py-1 text-sm text-ink shadow-xs transition-colors',
        'placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="control"
    className={cn(
      'flex min-h-[72px] w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs',
      'placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50',
      'aria-[invalid=true]:border-danger',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

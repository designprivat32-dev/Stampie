'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Renders the stamp row from /api/preview/strip.
 *
 * The previous image stays on screen until the new one has decoded, which is what keeps
 * the preview from flashing the background colour on every debounce tick. There is no
 * React re-implementation of the grid here — this <img> is the same PNG the pass gets.
 */
export function StampStripImg({
  src,
  alt,
  className,
  aspect,
}: {
  src: string
  alt: string
  className?: string
  /** width / height of the target canvas. */
  aspect: number
}) {
  const [displayed, setDisplayed] = React.useState(src)
  const [pending, setPending] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (src === displayed) return
    setFailed(false)
    setPending(src)

    const img = new Image()
    img.src = src
    img.decode()
      .then(() => {
        setDisplayed(src)
        setPending(null)
      })
      .catch(() => {
        // decode() rejects on load errors too; show the fallback rather than a blank strip.
        setPending(null)
        setFailed(true)
      })
  }, [src, displayed])

  if (failed) {
    return (
      <div
        className={cn('flex items-center justify-center bg-black/20 text-[11px] text-white/70', className)}
        style={{ aspectRatio: String(aspect) }}
        role="img"
        aria-label={alt}
      >
        Vorschau konnte nicht geladen werden
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displayed}
      alt={alt}
      width={375}
      height={Math.round(375 / aspect)}
      className={cn('block w-full select-none', pending ? 'opacity-95' : 'opacity-100', className)}
      style={{ aspectRatio: String(aspect) }}
      draggable={false}
    />
  )
}

'use client'

import * as React from 'react'

/**
 * Returns `value` delayed by `delay` ms. Used to keep the preview from re-rendering on
 * every keystroke and every pixel of a colour-picker drag.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

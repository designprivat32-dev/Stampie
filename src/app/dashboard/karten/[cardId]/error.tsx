'use client'

import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function KarteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="size-8 text-danger" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-ink">Der Karten-Designer konnte nicht geladen werden</h1>
        <p className="text-[13px] text-ink-2">
          Bereits gespeicherte Änderungen sind nicht verloren. Bitte erneut versuchen.
        </p>
      </div>
      <Button variant="primary" onClick={reset}>
        <RotateCw />
        Erneut versuchen
      </Button>
    </main>
  )
}

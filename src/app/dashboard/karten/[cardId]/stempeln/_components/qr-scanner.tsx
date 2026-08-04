'use client'

import * as React from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'

/**
 * Camera QR scanner built on the native BarcodeDetector.
 *
 * No scanning library: the API is built into Chrome on Android, which is what a counter
 * tablet or a shop phone runs. Where it is missing (iOS Safari, Firefox) the component
 * says so plainly and the page falls back to manual entry — a scanner that silently does
 * nothing is worse than no scanner.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

export type ScannerSupport = 'checking' | 'supported' | 'unsupported'

export function QrScanner({
  onScan,
  disabled,
}: {
  onScan: (value: string) => void
  disabled?: boolean
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [support, setSupport] = React.useState<ScannerSupport>('checking')
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Guards against firing the same card repeatedly while it sits in front of the lens.
  const lastValueRef = React.useRef<{ value: string; at: number } | null>(null)

  React.useEffect(() => {
    setSupport(getDetectorCtor() ? 'supported' : 'unsupported')
  }, [])

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setRunning(false)
  }, [])

  React.useEffect(() => stop, [stop])

  const start = React.useCallback(async () => {
    const Ctor = getDetectorCtor()
    if (!Ctor) return

    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setRunning(true)

      const detector = new Ctor({ formats: ['qr_code'] })

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          const value = codes[0]?.rawValue
          if (value) {
            const previous = lastValueRef.current
            const now = Date.now()
            if (!previous || previous.value !== value || now - previous.at > 3000) {
              lastValueRef.current = { value, at: now }
              onScan(value)
            }
          }
        } catch {
          // A single failed frame is normal (motion blur); keep going.
        }
        if (streamRef.current) requestAnimationFrame(() => void tick())
      }

      void tick()
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Kamerazugriff wurde abgelehnt. Bitte im Browser erlauben.'
          : 'Die Kamera konnte nicht gestartet werden.',
      )
      stop()
    }
  }, [onScan, stop])

  if (support === 'unsupported') {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-3 text-[13px] leading-snug text-warn-ink">
        <CameraOff className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Kamera-Scan wird von diesem Browser nicht unterstützt</p>
          <p>
            Funktioniert in Chrome auf Android. Alternativ die Kartennummer unten von Hand
            eingeben — sie steht unter dem Barcode auf der Karte.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-[oklch(0.2_0_0)]">
        <video
          ref={videoRef}
          playsInline
          muted
          className={running ? 'size-full object-cover' : 'hidden'}
        />

        {!running ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            {support === 'checking' ? (
              <Spinner />
            ) : (
              <>
                <Camera className="size-8" />
                <Button variant="secondary" onClick={() => void start()} disabled={disabled}>
                  Kamera starten
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Framing guide — staff aim faster with a target than without one. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-48 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-3 right-3"
              onClick={stop}
            >
              Kamera stoppen
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

'use client'

import * as React from 'react'
import jsQR from 'jsqr'
import { Camera, CameraOff, SwitchCamera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'

/**
 * Camera QR scanner.
 *
 * Two decoders, in this order:
 *
 *   1. `BarcodeDetector` — native and hardware-accelerated, but only shipped by Chrome on
 *      Android and ChromeOS. An earlier version used *only* this, which meant the scanner
 *      refused to work on iPhones, Firefox and Chrome on Windows — most of the devices a
 *      shop actually has behind the counter.
 *   2. `jsQR` — pure JavaScript over a canvas. Slower, but it runs everywhere.
 *
 * The camera needs a secure context (HTTPS or localhost) and, on iOS, a user gesture —
 * which is why nothing starts until the button is pressed.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

/** Longest edge the frame is downscaled to before decoding — full resolution is wasteful. */
const DECODE_SIZE = 640
/** Decoding every frame pins the CPU on a cheap tablet without finding codes any sooner. */
const DECODE_INTERVAL_MS = 120

export function QrScanner({
  onScan,
  disabled,
}: {
  onScan: (value: string) => void
  disabled?: boolean
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const detectorRef = React.useRef<BarcodeDetectorLike | null>(null)
  const runningRef = React.useRef(false)

  const [starting, setStarting] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [secure, setSecure] = React.useState(true)
  const [facingMode, setFacingMode] = React.useState<'environment' | 'user'>('environment')

  // Guards against firing the same card repeatedly while it sits in front of the lens.
  const lastValueRef = React.useRef<{ value: string; at: number } | null>(null)

  React.useEffect(() => {
    // getUserMedia is unavailable outside a secure context; say so plainly instead of
    // failing with a permission error the user cannot act on.
    setSecure(window.isSecureContext)
  }, [])

  const stop = React.useCallback(() => {
    runningRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setRunning(false)
  }, [])

  React.useEffect(() => stop, [stop])

  const handleValue = React.useCallback(
    (value: string) => {
      const previous = lastValueRef.current
      const now = Date.now()
      if (previous && previous.value === value && now - previous.at < 3000) return
      lastValueRef.current = { value, at: now }
      onScan(value)
    },
    [onScan],
  )

  const start = React.useCallback(async () => {
    setError(null)
    setStarting(true)

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('unsupported')
      video.srcObject = stream
      await video.play()

      const Ctor = getDetectorCtor()
      detectorRef.current = Ctor ? new Ctor({ formats: ['qr_code'] }) : null

      runningRef.current = true
      setRunning(true)
      setStarting(false)

      let lastDecode = 0

      const tick = async (timestamp: number) => {
        if (!runningRef.current || !videoRef.current) return

        if (timestamp - lastDecode >= DECODE_INTERVAL_MS && videoRef.current.readyState >= 2) {
          lastDecode = timestamp
          try {
            const value = detectorRef.current
              ? (await detectorRef.current.detect(videoRef.current))[0]?.rawValue
              : decodeWithJsQr(videoRef.current, canvasRef)
            if (value) handleValue(value)
          } catch {
            // A single failed frame is normal (motion blur, nothing in view).
          }
        }

        if (runningRef.current) requestAnimationFrame((t) => void tick(t))
      }

      requestAnimationFrame((t) => void tick(t))
    } catch (e) {
      setStarting(false)
      stop()
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        setError('Kamerazugriff wurde abgelehnt. Bitte im Browser für diese Seite erlauben.')
      } else if (e instanceof DOMException && e.name === 'NotFoundError') {
        setError('Keine Kamera gefunden.')
      } else {
        setError('Die Kamera konnte nicht gestartet werden.')
      }
    }
  }, [facingMode, handleValue, stop])

  const switchCamera = React.useCallback(() => {
    stop()
    setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))
  }, [stop])

  // Restart automatically after switching lenses, but never on first render.
  const previousFacing = React.useRef(facingMode)
  React.useEffect(() => {
    if (previousFacing.current === facingMode) return
    previousFacing.current = facingMode
    void start()
  }, [facingMode, start])

  if (!secure) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-3 text-[13px] leading-snug text-warn-ink">
        <CameraOff className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium">Kamera braucht HTTPS</p>
          <p>
            Diese Seite wird unverschlüsselt ausgeliefert, deshalb gibt der Browser die Kamera
            nicht frei. Bitte die https-Adresse verwenden.
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
          autoPlay
          className={running ? 'size-full object-cover' : 'hidden'}
        />

        {!running ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            {starting ? (
              <>
                <Spinner />
                <span className="text-[12px]">Kamera wird gestartet…</span>
              </>
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
            <div className="absolute bottom-3 right-3 flex gap-1.5">
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label="Kamera wechseln"
                title="Kamera wechseln"
                onClick={switchCamera}
              >
                <SwitchCamera />
              </Button>
              <Button variant="secondary" size="sm" onClick={stop}>
                Stoppen
              </Button>
            </div>
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

/**
 * Decodes the current video frame with jsQR.
 *
 * The frame is drawn into an offscreen canvas at reduced size first: decoding 1280x720
 * costs several times more than 640px and finds nothing extra at counter distance.
 */
function decodeWithJsQr(
  video: HTMLVideoElement,
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>,
): string | undefined {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return undefined

  const scale = Math.min(1, DECODE_SIZE / Math.max(width, height))
  const targetWidth = Math.round(width * scale)
  const targetHeight = Math.round(height * scale)

  const canvas = (canvasRef.current ??= document.createElement('canvas'))
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return undefined

  context.drawImage(video, 0, 0, targetWidth, targetHeight)
  const image = context.getImageData(0, 0, targetWidth, targetHeight)

  // `attemptBoth` also reads codes shown on a screen, where some wallet themes invert
  // black and white.
  const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  return result?.data
}

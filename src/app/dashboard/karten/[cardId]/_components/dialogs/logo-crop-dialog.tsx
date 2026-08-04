'use client'

import * as React from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import type { CropRect } from '@/lib/images/upload-constraints'

/**
 * Crop dialog. It only produces a rectangle — the actual cut and the @2x/@3x variants are
 * done server-side by sharp, so a client with a broken canvas cannot produce a broken
 * asset.
 */
export function LogoCropDialog({
  open,
  onOpenChange,
  imageUrl,
  aspect,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageUrl: string | null
  aspect: number
  title: string
  description: string
  onConfirm: (crop: CropRect) => void
}) {
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [area, setArea] = React.useState<Area | null>(null)

  React.useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setArea(null)
    }
  }, [open, imageUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative h-64 w-full overflow-hidden rounded-lg bg-[oklch(0.25_0_0)]">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              restrictPosition={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_area, pixels) => setArea(pixels)}
            />
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="crop-zoom">Zoom</Label>
          <Slider
            id="crop-zoom"
            min={1}
            max={4}
            step={0.01}
            value={[zoom]}
            onValueChange={([next]) => setZoom(next ?? 1)}
            aria-label="Zoom"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            disabled={!area}
            onClick={() => {
              if (!area) return
              onConfirm({ x: area.x, y: area.y, width: area.width, height: area.height })
              onOpenChange(false)
            }}
          >
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

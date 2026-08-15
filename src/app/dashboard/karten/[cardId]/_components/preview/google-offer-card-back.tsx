'use client'

import { ExternalLink, Phone } from 'lucide-react'
import { EditableField } from './editable-field'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * The offer card's details view — where `details` and `finePrint` actually surface, along
 * with the shop's own back fields. Same split as the loyalty card: text rows first, link
 * list at the bottom, because that is how Google groups them.
 */
export function GoogleOfferCardBack({ design }: { design: CardDesignInput }) {
  const patch = useCardEditor((s) => s.patch)
  const live = useCardEditor((s) => s.design)

  const textModules = design.backFields.filter((f) => f.type !== 'url' && f.type !== 'phone')
  const links = design.backFields.filter((f) => f.type === 'url' || f.type === 'phone')

  return (
    <div className="flex w-[336px] flex-col overflow-hidden rounded-[14px] bg-white text-[#1f1f1f] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="border-b border-black/10 px-4 py-3">
        <span className="text-[13px] font-medium">Gutschein-Details</span>
      </div>

      <dl className="divide-y divide-black/[0.07]">
        <div className="px-4 py-3">
          <dt className="text-[11px] text-black/55">Beschreibung</dt>
          <dd className="mt-0.5 text-[13px] leading-snug">
            <EditableField
              value={live.offerDetails ?? ''}
              onCommit={(v) => patch({ offerDetails: v || null })}
              placeholder="Gilt auf das gesamte Sortiment."
              maxLength={500}
              tone="dark"
              ariaLabel="Gutschein-Beschreibung"
              truncate={false}
            />
          </dd>
        </div>

        <div className="px-4 py-3">
          <dt className="text-[11px] text-black/55">Einlösebedingungen</dt>
          <dd className="mt-0.5 text-[13px] leading-snug">
            <EditableField
              value={live.offerFinePrint ?? ''}
              onCommit={(v) => patch({ offerFinePrint: v || null })}
              placeholder="Nicht mit anderen Aktionen kombinierbar."
              maxLength={500}
              tone="dark"
              ariaLabel="Einlösebedingungen"
              truncate={false}
            />
          </dd>
        </div>

        {textModules.map((field) => (
          <div key={field.id} className="px-4 py-3">
            <dt className="text-[11px] text-black/55">{field.label}</dt>
            <dd className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-snug">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>

      {links.length > 0 ? (
        <div className="border-t border-black/10 px-4 py-2">
          {links.map((field) => (
            <a
              key={field.id}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-2 py-2 text-[13px] text-[#1a73e8]"
            >
              {field.type === 'phone' ? (
                <Phone className="size-3.5" />
              ) : (
                <ExternalLink className="size-3.5" />
              )}
              {field.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}

'use client'

import { ExternalLink } from 'lucide-react'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Apple Wallet card back: a plain list of label/value rows on a light sheet.
 * PassKit puts no limit on the number of back fields.
 */
export function AppleStoreCardBack({ design }: { design: CardDesignInput }) {
  return (
    <div className="flex w-[336px] flex-col overflow-hidden rounded-[10px] bg-[#f2f2f7] text-[#1c1c1e] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between border-b border-black/10 px-3.5 py-2.5">
        <span className="text-[13px] font-semibold">
          {design.programName.trim() || 'Stempelkarte'}
        </span>
        <span className="text-[11px] text-black/45">Rückseite</span>
      </div>

      {design.backFields.length === 0 ? (
        <p className="px-3.5 py-8 text-center text-[12px] text-black/45">
          Noch keine Felder auf der Rückseite.
        </p>
      ) : (
        <dl className="divide-y divide-black/10">
          {design.backFields.map((field) => (
            <div key={field.id} className="px-3.5 py-2.5">
              <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-black/45">
                {field.label}
              </dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-[12.5px] leading-snug">
                {field.type === 'url' || field.type === 'legal' ? (
                  <span className="inline-flex items-center gap-1 text-[#0a66d6]">
                    {field.value}
                    <ExternalLink className="size-3" />
                  </span>
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

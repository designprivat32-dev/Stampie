'use client'

import { ExternalLink, Phone } from 'lucide-react'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Google Wallet card details view.
 *
 * Google splits the back into textModulesData (plain rows) and linksModuleData (a link
 * list at the bottom), which is why website and phone are grouped separately here. Long
 * lists get truncated in the real client — the notice at the bottom says so rather than
 * pretending everything fits.
 */
const VISIBLE_TEXT_MODULES = 8

export function GoogleLoyaltyCardBack({ design }: { design: CardDesignInput }) {
  const textModules = design.backFields.filter((f) => f.type !== 'url' && f.type !== 'phone')
  const links = design.backFields.filter((f) => f.type === 'url' || f.type === 'phone')
  const visible = textModules.slice(0, VISIBLE_TEXT_MODULES)
  const hidden = textModules.length - visible.length

  return (
    <div className="flex w-[336px] flex-col overflow-hidden rounded-[14px] bg-white text-[#1f1f1f] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="border-b border-black/10 px-4 py-3">
        <span className="text-[13px] font-medium">Kartendetails</span>
      </div>

      {design.backFields.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-black/45">
          Noch keine Felder auf der Rückseite.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-black/[0.07]">
            {design.rewardText.trim() ? (
              <div className="px-4 py-3">
                <dt className="text-[11px] text-black/55">Belohnung</dt>
                <dd className="mt-0.5 text-[13px]">{design.rewardText.trim()}</dd>
              </div>
            ) : null}
            {visible.map((field) => (
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

          {hidden > 0 ? (
            <p className="border-t border-black/10 px-4 py-2 text-[11px] text-black/45">
              {hidden} weitere {hidden === 1 ? 'Feld wird' : 'Felder werden'} von Google Wallet
              ausgeblendet.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

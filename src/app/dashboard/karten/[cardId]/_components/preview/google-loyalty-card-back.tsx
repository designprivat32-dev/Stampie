'use client'

import { ExternalLink, Phone } from 'lucide-react'
import { EditableField } from './editable-field'
import { useCardEditor } from '@/stores/card-editor-provider'
import type { CardDesignInput } from '@/lib/cards/schema'

/**
 * Google Wallet card details view.
 *
 * This is where Google's default loyalty template puts everything that is *not* on the card
 * face: `accountName`, `accountId`, `rewardsTier`, `textModulesData` (plain rows) and
 * `linksModuleData` (a link list at the bottom). Website and phone are grouped separately
 * because Google groups them. Long lists get truncated in the real client — the notice at
 * the bottom says so rather than pretending everything fits.
 *
 * Text is click-to-edit here as well, mirroring the card face.
 */
const VISIBLE_TEXT_MODULES = 8

export function GoogleLoyaltyCardBack({ design }: { design: CardDesignInput }) {
  const patch = useCardEditor((s) => s.patch)
  const live = useCardEditor((s) => s.design)

  const textModules = design.backFields.filter((f) => f.type !== 'url' && f.type !== 'phone')
  const links = design.backFields.filter((f) => f.type === 'url' || f.type === 'phone')
  const visible = textModules.slice(0, VISIBLE_TEXT_MODULES)
  const hidden = textModules.length - visible.length

  const showsTier = live.googleRewardsTierEnabled && Boolean(live.rewardsTier)
  const isEmpty =
    design.backFields.length === 0 &&
    !live.rewardText.trim() &&
    !live.accountNameLabel &&
    !live.accountIdLabel &&
    !showsTier

  return (
    <div className="flex w-[336px] flex-col overflow-hidden rounded-[14px] bg-white text-[#1f1f1f] shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="border-b border-black/10 px-4 py-3">
        <span className="text-[13px] font-medium">Kartendetails</span>
      </div>

      {isEmpty ? (
        <p className="px-4 py-8 text-center text-[12px] text-black/45">
          Noch keine Felder auf der Rückseite.
        </p>
      ) : (
        <>
          <dl className="divide-y divide-black/[0.07]">
            {/* accountName / accountId — per-customer, so the value is a placeholder here. */}
            {live.accountNameLabel ? (
              <div className="px-4 py-3">
                <dt className="text-[11px] text-black/55">
                  <EditableField
                    value={live.accountNameLabel ?? ''}
                    onCommit={(v) => patch({ accountNameLabel: v || null })}
                    placeholder="Mitglied"
                    maxLength={15}
                    tone="dark"
                    ariaLabel="Label für Kontoinhaber"
                  />
                </dt>
                <dd className="mt-0.5 text-[13px]">—</dd>
              </div>
            ) : null}

            {live.accountIdLabel ? (
              <div className="px-4 py-3">
                <dt className="text-[11px] text-black/55">
                  <EditableField
                    value={live.accountIdLabel ?? ''}
                    onCommit={(v) => patch({ accountIdLabel: v || null })}
                    placeholder="Nr."
                    maxLength={15}
                    tone="dark"
                    ariaLabel="Label für ID"
                  />
                </dt>
                <dd className="mt-0.5 text-[13px]">—</dd>
              </div>
            ) : null}

            {showsTier ? (
              <div className="px-4 py-3">
                <dt className="text-[11px] text-black/55">
                  <EditableField
                    value={live.rewardsTierLabel ?? ''}
                    onCommit={(v) => patch({ rewardsTierLabel: v || null })}
                    placeholder="Stufe"
                    maxLength={9}
                    tone="dark"
                    ariaLabel="Label für Stufe"
                  />
                </dt>
                <dd className="mt-0.5 text-[13px]">
                  <EditableField
                    value={live.rewardsTier ?? ''}
                    onCommit={(v) => patch({ rewardsTier: v || null })}
                    placeholder="Gold"
                    maxLength={7}
                    tone="dark"
                    ariaLabel="Stufen-Name"
                  />
                </dd>
              </div>
            ) : null}

            {live.rewardText.trim() ? (
              <div className="px-4 py-3">
                <dt className="text-[11px] text-black/55">Belohnung</dt>
                <dd className="mt-0.5 text-[13px]">
                  <EditableField
                    value={live.rewardText}
                    onCommit={(v) => patch({ rewardText: v })}
                    placeholder="Belohnungstext"
                    maxLength={80}
                    tone="dark"
                    ariaLabel="Belohnungstext"
                    truncate={false}
                  />
                </dd>
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

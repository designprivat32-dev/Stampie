import type { ResolvedBusinessCard } from '@/lib/business-cards/scan-service'
import { fullName } from '@/lib/business-cards/apple-pass-json'

/**
 * Die Visitenkarte, wie sie gleich im Wallet liegt — in den Farben der Karte, mit dem
 * Logo der Firma. Auf der Scan-Seite und auf der Seite des Ausstellers dieselbe.
 */
export function BusinessCardFace({ card }: { card: ResolvedBusinessCard }) {
  const { design, contact, company } = card
  return (
    <div
      className="rounded-[28px] px-6 pb-8 pt-9 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)]"
      style={{ backgroundColor: design.backgroundColor, color: design.foregroundColor }}
    >
      <div
        className="mx-auto flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-3xl border"
        style={{
          backgroundColor: `${design.foregroundColor}14`,
          borderColor: `${design.foregroundColor}2b`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/wallet/logo/${card.cardId}`}
          alt=""
          width={88}
          height={88}
          className="h-[72px] w-[72px] object-contain"
        />
      </div>

      {company ? (
        <p className="mt-5 text-[12px] uppercase tracking-[0.14em] opacity-70">{company.company}</p>
      ) : null}
      <p className="mt-1.5 text-[25px] font-semibold leading-tight">{fullName(contact)}</p>
      {contact.jobTitle ? <p className="mt-1 text-[14px] opacity-80">{contact.jobTitle}</p> : null}
    </div>
  )
}

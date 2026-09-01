import { prisma } from '@/lib/db'
import { PrivacyNotice, PrivacyShell } from '@/components/privacy-notice'

export const dynamic = 'force-dynamic'

/**
 * Dieselbe Information, erreicht über die Seriennummer der Karte.
 *
 * Der Weg *nach* der Ausgabe: wer die Karte im Wallet hat, kommt über den Link auf ihrer
 * Rückseite hierher. Der Ausgabe-Code hilft ihm da nicht — den hat er nie gesehen, der
 * steht auf dem Aufsteller im Laden.
 *
 * Bewusst ohne Anmeldung: die Seriennummer steht auf der eigenen Karte, und die Seite gibt
 * nichts preis, was nicht ohnehin auf ihr steht. Sie nennt keine Stempelstände und keine
 * Historie — nur, was das System über solche Karten speichert.
 */
export default async function PassPrivacyPage({
  params,
}: {
  params: Promise<{ serial: string }>
}) {
  const { serial } = await params

  const pass = await prisma.issuedPass.findFirst({
    where: { serial: serial.toUpperCase() },
    select: {
      serial: true,
      card: {
        select: {
          name: true,
          org: {
            select: {
              name: true,
              street: true,
              postalCode: true,
              city: true,
              phone: true,
              email: true,
            },
          },
        },
      },
    },
  })

  if (!pass) {
    return (
      <PrivacyShell title="Nicht verfügbar">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Diese Kartennummer gehört zu keiner ausgegebenen Karte.
        </p>
      </PrivacyShell>
    )
  }

  const org = pass.card.org

  return (
    <PrivacyNotice
      shop={{
        // Ohne zugewiesenen Betrieb steht der Kartenname — dasselbe tut die Ausgabeseite.
        organizationName: org?.name ?? pass.card.name,
        street: org?.street ?? null,
        postalCode: org?.postalCode ?? null,
        city: org?.city ?? null,
        phone: org?.phone ?? null,
        email: org?.email ?? null,
      }}
      backHref={`/s/${pass.serial}`}
    />
  )
}

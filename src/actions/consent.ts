'use server'

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { fail, guarded, ok, type ActionResult } from '@/lib/action-result'

/**
 * Widerruf der Einwilligung in Werbenachrichten.
 *
 * Ohne Anmeldung, mit Absicht. Wer die Kartennummer hat, hält die Karte — etwas anderes
 * gibt es nicht, an dem sich der Kunde ausweisen könnte, weil zu keinem Pass ein Name
 * gespeichert wird. Eine Einwilligung, deren Widerruf schwerer ist als die Zustimmung,
 * wäre ohnehin keine wirksame.
 *
 * Das Schlimmste, was ein Fremder mit einer geratenen Nummer anrichten kann, ist, dass
 * jemand keine Werbung mehr bekommt. Diese Richtung ist die harmlose.
 */

const serialSchema = z.string().trim().min(3).max(40)

export async function withdrawMarketingConsentAction(
  serial: string,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const parsed = serialSchema.safeParse(serial)
    if (!parsed.success) return fail('Ungültige Kartennummer.', 'validation')

    // Nur gegen das Durchprobieren von Nummern, nicht gegen den Kunden selbst.
    if (!rateLimit(`consent-withdraw:${parsed.data.toUpperCase()}`, 20, 60 * 60 * 1000).allowed) {
      return fail('Zu viele Versuche. Bitte später erneut.', 'rate_limited')
    }

    // updateMany statt update: eine unbekannte Nummer soll sich nicht daran verraten, dass
    // sie einen Fehler auslöst und eine bekannte nicht.
    await prisma.issuedPass.updateMany({
      where: { serial: parsed.data.toUpperCase() },
      data: { marketingConsentAt: null, marketingConsentText: null },
    })

    return ok(null)
  })
}

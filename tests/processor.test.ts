import { describe, expect, it } from 'vitest'
import { readProcessor } from '@/lib/legal/processor'

/**
 * Die Angaben zum Auftragsverarbeiter stehen in einer Datenschutzinformation, die echte
 * Kunden lesen. Halbe Angaben wären dort schlimmer als gar keine — deshalb gibt es nur
 * vollständig oder nichts.
 */
describe('readProcessor', () => {
  const voll = {
    PROCESSOR_NAME: '32Design GmbH',
    PROCESSOR_ADDRESS: 'Musterweg 1, 26123 Oldenburg',
    PROCESSOR_EMAIL: 'datenschutz@example.de',
  }

  it('liefert die Angaben, wenn alle drei gesetzt sind', () => {
    const { processor, missing } = readProcessor(voll)
    expect(missing).toEqual([])
    expect(processor).toEqual({
      name: '32Design GmbH',
      address: 'Musterweg 1, 26123 Oldenburg',
      email: 'datenschutz@example.de',
    })
  })

  it('nennt jede fehlende Variable beim Namen', () => {
    expect(readProcessor({}).missing).toEqual([
      'PROCESSOR_NAME',
      'PROCESSOR_ADDRESS',
      'PROCESSOR_EMAIL',
    ])
  })

  it('gibt lieber nichts aus als eine halbe Angabe', () => {
    const { processor, missing } = readProcessor({ ...voll, PROCESSOR_EMAIL: '   ' })
    expect(processor).toBeNull()
    expect(missing).toEqual(['PROCESSOR_EMAIL'])
  })

  it('schneidet Leerraum ab', () => {
    expect(readProcessor({ ...voll, PROCESSOR_NAME: '  32Design GmbH  ' }).processor?.name).toBe(
      '32Design GmbH',
    )
  })
})

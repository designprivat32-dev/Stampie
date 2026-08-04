import { describe, expect, it } from 'vitest'
import { CARD_TEMPLATES, applyTemplate, getTemplate, templateAsDesign } from '@/lib/cards/templates'
import { PLATFORM_SUPPORT, isPlatformLimited, supportFor } from '@/lib/cards/platform-support'
import { cardDesignDraftSchema, contrastRatioForDesign } from '@/lib/cards/schema'
import { DEFAULT_CARD_DESIGN, newFieldId } from '@/lib/cards/defaults'
import { computeStampLayout } from '@/lib/cards/stamp-layout'
import { walletHeroUrl, walletLogoUrl } from '@/lib/wallet/image-urls'

describe('card templates', () => {
  it('covers the eight industries the sales pitch needs', () => {
    expect(CARD_TEMPLATES.map((t) => t.id)).toEqual([
      'barbershop',
      'cafe',
      'baeckerei',
      'pizzeria',
      'eisdiele',
      'nagelstudio',
      'waschstrasse',
      'neutral',
    ])
  })

  it.each(CARD_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s produces a schema-valid design with no further input',
    (_id, template) => {
      const result = cardDesignDraftSchema.safeParse(templateAsDesign(template))
      expect(result.success).toBe(true)
    },
  )

  it.each(CARD_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s is readable — every preset clears 4.5:1',
    (_id, template) => {
      const design = templateAsDesign(template)
      // A template that ships with a contrast warning is not a 30-second demo.
      expect(contrastRatioForDesign(design)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(CARD_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s has copy filled in and a valid stamp goal',
    (_id, template) => {
      expect(template.design.programName.trim().length).toBeGreaterThan(0)
      expect(template.design.rewardText.trim().length).toBeGreaterThan(0)
      expect(template.design.stampGoal).toBeGreaterThanOrEqual(3)
      expect(template.design.stampGoal).toBeLessThanOrEqual(20)
      // The grid must actually fit the strip at this stamp count.
      expect(computeStampLayout(template.design.stampGoal).cells).toHaveLength(
        template.design.stampGoal,
      )
    },
  )

  it('applying a template keeps assets, back fields and geo untouched', () => {
    const current = {
      ...DEFAULT_CARD_DESIGN,
      logoAssetId: 'clogo0000000000000000001',
      backFields: [{ id: 'a', type: 'text' as const, label: 'A', value: '1' }],
      barcodeFormat: 'PDF417' as const,
    }
    const next = applyTemplate(current, getTemplate('pizzeria')!)

    expect(next.logoAssetId).toBe('clogo0000000000000000001')
    expect(next.backFields).toEqual(current.backFields)
    expect(next.barcodeFormat).toBe('PDF417')
    expect(next.stampIcon).toBe('pizza')
    expect(next.backgroundColor).toBe('#8c1c13')
  })

  it('does not mutate the design it was given', () => {
    const current = { ...DEFAULT_CARD_DESIGN }
    applyTemplate(current, getTemplate('cafe')!)
    expect(current.stampIcon).toBe('coffee')
    expect(current.backgroundColor).toBe('#1a1a1a')
  })

  it('returns undefined for an unknown id', () => {
    expect(getTemplate('gemuesehaendler')).toBeUndefined()
  })
})

describe('platform support matrix', () => {
  it('marks Apple-only colour fields', () => {
    expect(supportFor('foregroundColor').google).toBe('none')
    expect(supportFor('labelColor').google).toBe('none')
    expect(isPlatformLimited('foregroundColor')).toBe(true)
  })

  it('marks fields both wallets handle fully', () => {
    expect(isPlatformLimited('backgroundColor')).toBe(false)
    expect(isPlatformLimited('stampCounter')).toBe(false)
  })

  it('every limited field explains itself in German', () => {
    for (const [field, support] of Object.entries(PLATFORM_SUPPORT)) {
      if (support.apple === 'full' && support.google === 'full') continue
      expect(support.note.length, `${field} has no note`).toBeGreaterThan(10)
    }
  })
})

describe('newFieldId', () => {
  it('produces distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newFieldId()))
    expect(ids.size).toBe(500)
  })
})

describe('square logo for Google', () => {
  it('is marked Google-only in the support matrix', () => {
    expect(supportFor('squareLogo').apple).toBe('none')
    expect(supportFor('squareLogo').google).toBe('full')
    expect(isPlatformLimited('squareLogo')).toBe(true)
  })

  it('is part of the design schema and defaults to none', () => {
    expect(DEFAULT_CARD_DESIGN.squareLogoAssetId).toBeNull()
    const parsed = cardDesignDraftSchema.safeParse({
      ...DEFAULT_CARD_DESIGN,
      squareLogoAssetId: 'clh0000000000000000000000',
    })
    expect(parsed.success).toBe(true)
  })

  it('survives a template being applied — templates never touch assets', () => {
    const withLogo = { ...DEFAULT_CARD_DESIGN, squareLogoAssetId: 'clh0000000000000000000000' }
    expect(applyTemplate(withLogo, getTemplate('cafe')!).squareLogoAssetId).toBe(
      'clh0000000000000000000000',
    )
  })
})

describe('wallet image URLs are cache-busted', () => {
  // Google caches pass images by URL and never revalidates. A stable URL means a logo the
  // shop owner can never change again.
  const base = 'https://stemply.de'
  const loc = 'cloc1'

  it('a new logo produces a new URL', () => {
    const before = walletLogoUrl(base, loc, DEFAULT_CARD_DESIGN)
    const after = walletLogoUrl(base, loc, {
      ...DEFAULT_CARD_DESIGN,
      squareLogoAssetId: 'clh0000000000000000000000',
    })
    expect(before).not.toBe(after)
  })

  it('a colour change produces a new logo URL', () => {
    expect(walletLogoUrl(base, loc, DEFAULT_CARD_DESIGN)).not.toBe(
      walletLogoUrl(base, loc, { ...DEFAULT_CARD_DESIGN, backgroundColor: '#8c1c13' }),
    )
  })

  it('a colour change produces a new hero URL even at the same stamp count', () => {
    expect(walletHeroUrl(base, loc, DEFAULT_CARD_DESIGN, 5)).not.toBe(
      walletHeroUrl(base, loc, { ...DEFAULT_CARD_DESIGN, foregroundColor: '#ff0000' }, 5),
    )
  })

  it('carries the stamp count and clamps it to the goal', () => {
    expect(walletHeroUrl(base, loc, DEFAULT_CARD_DESIGN, 3)).toContain('s=3')
    expect(walletHeroUrl(base, loc, DEFAULT_CARD_DESIGN, 999)).toContain('s=10')
  })

  it('is stable when nothing relevant changed', () => {
    expect(walletLogoUrl(base, loc, DEFAULT_CARD_DESIGN)).toBe(
      walletLogoUrl(base, loc, { ...DEFAULT_CARD_DESIGN, programName: 'anders' }),
    )
  })
})

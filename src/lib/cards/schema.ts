import { z } from 'zod'
import { CUSTOM_ICON_KEY, isEmojiIcon, isLibraryIcon } from './stamp-icons'
import { contrastRatio } from '@/lib/color/contrast'

/**
 * The single source of truth for card design validation — used verbatim by the client
 * resolver and by every server action. Client-side validation is convenience; the server
 * re-validates the same object before it touches the database.
 *
 * Two levels:
 *   - `cardDesignDraftSchema`   structural limits only. A freshly created draft has no
 *                               program name, no reward and no legal links yet, so autosave
 *                               must be able to persist it.
 *   - `cardDesignPublishSchema` the draft schema plus everything German law and PassKit
 *                               require before a pass may be handed to a customer.
 *
 * Publish is a refinement *on* the draft schema, not a second schema.
 */

// --------------------------------------------------------------------- primitives

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_RE, 'Farbe muss im Format #rrggbb angegeben werden.')
  .transform((v) => v.toLowerCase())

export const BARCODE_FORMATS = ['QR', 'CODE128', 'PDF417', 'AZTEC'] as const
export type BarcodeFormat = (typeof BARCODE_FORMATS)[number]
export const barcodeFormatSchema = z.enum(BARCODE_FORMATS)

export const EMPTY_STAMP_STYLES = ['outline', 'transparent', 'dashed'] as const
export type EmptyStampStyle = (typeof EMPTY_STAMP_STYLES)[number]
export const emptyStampStyleSchema = z.enum(EMPTY_STAMP_STYLES)

/**
 * What a card issues. Chosen once at creation: the wallet pass type differs (Google
 * loyalty vs. offer, Apple storeCard vs. coupon) and is baked into every pass already
 * sitting in a customer's wallet, so switching later would orphan all of them.
 */
export const CARD_KINDS = ['STAMP', 'COUPON'] as const
export type CardKind = (typeof CARD_KINDS)[number]
export const cardKindSchema = z.enum(CARD_KINDS)

/** Google OfferClass.redemptionChannel — a required field on every offer class. */
export const REDEMPTION_CHANNELS = ['INSTORE', 'ONLINE', 'BOTH'] as const
export type RedemptionChannel = (typeof REDEMPTION_CHANNELS)[number]
export const redemptionChannelSchema = z.enum(REDEMPTION_CHANNELS)

export const STAMP_GOAL_MIN = 3
export const STAMP_GOAL_MAX = 20

/** PassKit hard limit: a pass may carry at most 10 locations. */
export const MAX_GEO_LOCATIONS = 10
/** PassKit field-area limits for a `storeCard`. */
export const MAX_HEADER_FIELDS = 3
export const MAX_SECONDARY_FIELDS = 4
export const MAX_AUXILIARY_FIELDS = 4
export const MAX_BACK_FIELDS = 50

// --------------------------------------------------------------------- back fields

export const BACK_FIELD_TYPES = ['text', 'url', 'phone', 'address', 'hours', 'legal'] as const
export type BackFieldType = (typeof BACK_FIELD_TYPES)[number]

export const LEGAL_KINDS = ['imprint', 'privacy', 'terms'] as const
export type LegalKind = (typeof LEGAL_KINDS)[number]

const backFieldBase = {
  id: z.string().min(1).max(64),
  label: z.string().min(1, 'Bezeichnung fehlt.').max(40, 'Bezeichnung ist zu lang (max. 40 Zeichen).'),
}

/**
 * Discriminated union — the `type` drives both the editor input control and the Google
 * Wallet mapping (`url`/`phone` become linksModuleData, everything else textModulesData).
 */
export const backFieldSchema = z.discriminatedUnion('type', [
  z.object({
    ...backFieldBase,
    type: z.literal('text'),
    value: z.string().max(500, 'Text ist zu lang (max. 500 Zeichen).'),
  }),
  z.object({
    ...backFieldBase,
    type: z.literal('url'),
    value: z.string().url('Bitte eine vollständige Adresse inkl. https:// angeben.').max(500),
  }),
  z.object({
    ...backFieldBase,
    type: z.literal('phone'),
    value: z
      .string()
      .max(40)
      .regex(/^[+0-9 ()/-]{5,40}$/, 'Bitte eine gültige Telefonnummer angeben.'),
  }),
  z.object({
    ...backFieldBase,
    type: z.literal('address'),
    value: z.string().max(500),
  }),
  z.object({
    ...backFieldBase,
    type: z.literal('hours'),
    value: z.string().max(500),
  }),
  z.object({
    ...backFieldBase,
    type: z.literal('legal'),
    kind: z.enum(LEGAL_KINDS),
    value: z.string().url('Rechtliche Links müssen vollständige URLs sein.').max(500),
  }),
])

export type BackField = z.infer<typeof backFieldSchema>

// --------------------------------------------------------------------- geo

export const geoLocationSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1, 'Bezeichnung fehlt.').max(60),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Metres. Apple ignores anything below ~10 m; above 5 km it is useless in practice. */
  maxDistance: z.number().int().min(10).max(5000),
  relevantText: z.string().max(60, 'Hinweistext ist zu lang (max. 60 Zeichen).'),
})

export type GeoLocation = z.infer<typeof geoLocationSchema>

// --------------------------------------------------------------------- stamp icon

const stampIconSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (v) => v === CUSTOM_ICON_KEY || isLibraryIcon(v) || isEmojiIcon(v),
    'Unbekanntes Stempel-Symbol.',
  )

// --------------------------------------------------------------------- draft

export const cardDesignDraftSchema = z
  .object({
    // branding
    backgroundColor: hexColorSchema,
    foregroundColor: hexColorSchema,
    labelColor: hexColorSchema,
    logoAssetId: z.string().cuid().nullable().default(null),
    squareLogoAssetId: z.string().cuid().nullable().default(null),
    iconAssetId: z.string().cuid().nullable().default(null),
    heroAssetId: z.string().cuid().nullable().default(null),

    // program
    stampGoal: z
      .number()
      .int()
      .min(STAMP_GOAL_MIN, `Mindestens ${STAMP_GOAL_MIN} Stempel.`)
      .max(STAMP_GOAL_MAX, `Höchstens ${STAMP_GOAL_MAX} Stempel.`),
    stampIcon: stampIconSchema,
    stampIconAssetId: z.string().cuid().nullable().default(null),
    emptyStampStyle: emptyStampStyleSchema,
    rewardText: z.string().max(80, 'Belohnungstext ist zu lang (max. 80 Zeichen).'),

    // texts
    programName: z.string().max(30, 'Programmname ist zu lang (max. 30 Zeichen).'),
    cardTitle: z.string().max(40, 'Überschrift ist zu lang (max. 40 Zeichen).').nullable().default(null),
    /**
     * Shown as the issuer on both wallets. Null falls back to the organisation name, which
     * is the legal entity — shops trading under a brand need to say the brand instead.
     */
    issuerDisplayName: z
      .string()
      .max(40, 'Aussteller-Name ist zu lang (max. 40 Zeichen).')
      .nullable()
      .default(null),
    stampLabel: z.string().min(1, 'Bezeichnung fehlt.').max(16, 'Bezeichnung ist zu lang (max. 16 Zeichen).'),
    backFields: z
      .array(backFieldSchema)
      .max(MAX_BACK_FIELDS, `Höchstens ${MAX_BACK_FIELDS} Rückseiten-Felder.`),

    /**
     * Coupon fields, used by both kinds: they *are* the card when `Card.kind` is COUPON,
     * and they describe the reward a full stamp card hands out when `rewardCouponEnabled`
     * is on. Nullable at draft level for the same reason `programName` may be empty — a
     * fresh draft has none of them yet and autosave must still persist.
     */
    rewardCouponEnabled: z.boolean().default(false),
    offerTitle: z.string().max(60, 'Gutschein-Titel ist zu lang (max. 60 Zeichen).').nullable().default(null),
    offerDetails: z.string().max(500, 'Beschreibung ist zu lang (max. 500 Zeichen).').nullable().default(null),
    offerFinePrint: z
      .string()
      .max(500, 'Einlösebedingungen sind zu lang (max. 500 Zeichen).')
      .nullable()
      .default(null),
    redemptionChannel: redemptionChannelSchema.default('INSTORE'),

    // Google Wallet optional labels
    accountNameLabel: z.string().max(15, 'Label ist zu lang (max. 15 Zeichen).').nullable().default(null),
    accountIdLabel: z.string().max(15, 'Label ist zu lang (max. 15 Zeichen).').nullable().default(null),
    rewardsTierLabel: z.string().max(9, 'Label ist zu lang (max. 9 Zeichen).').nullable().default(null),
    rewardsTier: z.string().max(7, 'Stufen-Name ist zu lang (max. 7 Zeichen).').nullable().default(null),

    // Google Wallet optional features (disabled by default)
    googleAccountNameEnabled: z.boolean().default(false),
    googleRewardsTierEnabled: z.boolean().default(false),

    // advanced
    barcodeFormat: barcodeFormatSchema,
    geoLocations: z
      .array(geoLocationSchema)
      .max(MAX_GEO_LOCATIONS, `Apple Wallet erlaubt höchstens ${MAX_GEO_LOCATIONS} Standorte pro Karte.`),
    expiresAt: z.coerce.date().nullable().default(null),
    shareable: z.boolean(),
  })
  .superRefine((design, ctx) => {
    // Custom uploads and emoji are both rasterised into a STAMP_ICON asset (emoji are
    // rendered to PNG in the browser, which has the fonts the server does not). Without
    // that asset the strip would come out empty.
    const needsAsset = design.stampIcon === CUSTOM_ICON_KEY || isEmojiIcon(design.stampIcon)
    if (needsAsset && !design.stampIconAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stampIconAssetId'],
        message: 'Für ein eigenes Stempel-Symbol wird ein Bild benötigt.',
      })
    }
    // Duplicate back-field ids break drag & drop reordering and React keys.
    const ids = new Set<string>()
    design.backFields.forEach((f, i) => {
      if (ids.has(f.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['backFields', i, 'id'],
          message: 'Doppelte Feld-ID.',
        })
      }
      ids.add(f.id)
    })
    // At most one legal link per kind.
    const legalKinds = design.backFields.filter((f) => f.type === 'legal').map((f) => f.kind)
    const seen = new Set<LegalKind>()
    legalKinds.forEach((k) => {
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['backFields'],
          message: `Es darf nur einen Link für "${LEGAL_LABELS[k]}" geben.`,
        })
      }
      seen.add(k)
    })
  })

export type CardDesignInput = z.infer<typeof cardDesignDraftSchema>

export const LEGAL_LABELS: Record<LegalKind, string> = {
  imprint: 'Impressum',
  privacy: 'Datenschutz',
  terms: 'AGB',
}

// --------------------------------------------------------------------- publish

/** Below this the pass is unreadable in bright sunlight; publishing is blocked. */
export const CONTRAST_BLOCK_THRESHOLD = 3
/** WCAG AA for large text. Below this we warn but still allow publishing. */
export const CONTRAST_WARN_THRESHOLD = 4.5

/** The pair the publish gate actually cares about: text on background. */
export function contrastRatioForDesign(
  design: Pick<CardDesignInput, 'foregroundColor' | 'backgroundColor'>,
): number {
  return contrastRatio(design.foregroundColor, design.backgroundColor)
}

export interface PublishContext {
  /** Set when the user explicitly confirmed publishing despite a contrast below 3:1. */
  contrastConfirmed: boolean
  /** Decides which of the two field sets is mandatory. Defaults to the stamp card. */
  kind?: CardKind
}

/**
 * Publish requirements, branched by card kind.
 *
 * Everything a wallet or German law demands applies to both kinds — icon, imprint, privacy,
 * a sane expiry, readable contrast. Only the content differs: a stamp card is meaningless
 * without a goal and a reward, a coupon without an offer title, and demanding the other
 * kind's fields would block publishing on something the pass never shows.
 */
export function buildPublishSchema(ctxInput: PublishContext) {
  const kind: CardKind = ctxInput.kind ?? 'STAMP'

  return cardDesignDraftSchema.superRefine((design, ctx) => {
    if (kind === 'STAMP') {
      if (design.programName.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['programName'],
          message: 'Ohne Programmnamen kann die Karte nicht veröffentlicht werden.',
        })
      }
      if (design.rewardText.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rewardText'],
          message: 'Bitte eintragen, was der Kunde für eine volle Karte bekommt.',
        })
      }
      // A full card that hands out a coupon needs that coupon to be describable — Google
      // rejects an OfferClass without a title, so publishing must not defer this.
      if (design.rewardCouponEnabled && !design.offerTitle?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['offerTitle'],
          message:
            'Die volle Karte soll einen Gutschein ausgeben — dafür fehlt noch der Gutschein-Titel.',
        })
      }
    } else {
      // Google rejects an OfferClass without a title, so this is a hard requirement
      // rather than a nicety — it is also the only line the customer really reads.
      if (!design.offerTitle?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['offerTitle'],
          message: 'Ohne Gutschein-Titel kann der Gutschein nicht veröffentlicht werden.',
        })
      }
    }
    // icon.png is mandatory — a pass without it is rejected by Wallet.
    if (!design.iconAssetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['iconAssetId'],
        message: 'Ohne Icon (29×29) ist der Pass ungültig. Bitte im Tab „Branding" hochladen.',
      })
    }
    // German law: imprint and privacy policy must be reachable from the card.
    const kinds = new Set(design.backFields.filter((f) => f.type === 'legal').map((f) => f.kind))
    if (!kinds.has('imprint')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['backFields'],
        message: 'Impressum-Link fehlt. Ohne ihn darf die Karte nicht veröffentlicht werden.',
      })
    }
    if (!kinds.has('privacy')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['backFields'],
        message: 'Datenschutz-Link fehlt. Ohne ihn darf die Karte nicht veröffentlicht werden.',
      })
    }
    if (design.expiresAt && design.expiresAt.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'Das Gültigkeitsdatum liegt in der Vergangenheit.',
      })
    }
    const ratio = contrastRatio(design.foregroundColor, design.backgroundColor)
    if (ratio < CONTRAST_BLOCK_THRESHOLD && !ctxInput.contrastConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['foregroundColor'],
        message: `Kontrast ist mit ${ratio.toFixed(2)}:1 zu gering. Bitte Farben korrigieren oder das Veröffentlichen ausdrücklich bestätigen.`,
      })
    }
  })
}

export const cardDesignPublishSchema = buildPublishSchema({ contrastConfirmed: false })

// --------------------------------------------------------------------- action payloads

export const saveDraftInputSchema = z.object({
  cardId: z.string().cuid(),
  design: cardDesignDraftSchema,
})

export const publishInputSchema = z.object({
  cardId: z.string().cuid(),
  design: cardDesignDraftSchema,
  confirmLowContrast: z.boolean().default(false),
  note: z.string().max(200).optional(),
})

export const restoreVersionInputSchema = z.object({
  cardId: z.string().cuid(),
  versionId: z.string().cuid(),
})

export const createTestCardInputSchema = z.object({
  cardId: z.string().cuid(),
  design: cardDesignDraftSchema,
  simulatedStamps: z.number().int().min(0).max(STAMP_GOAL_MAX),
})

export const sendTestCardEmailInputSchema = z.object({
  cardId: z.string().cuid(),
  token: z.string().min(10).max(128),
  email: z.string().email('Bitte eine gültige E-Mail-Adresse angeben.'),
})

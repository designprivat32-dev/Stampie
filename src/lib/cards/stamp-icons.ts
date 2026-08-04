/**
 * Curated stamp icon library.
 *
 * Every icon is a single path (or a set of subpaths) normalised to a 24x24 viewBox and
 * designed to be *filled*, never stroked — the strip renderer only ever sets `fill` and
 * `opacity`, so an icon must read correctly as a solid silhouette at ~28px.
 *
 * Paths live here as data rather than as .svg files so that `render-strip.ts` stays free
 * of file IO and remains synchronous up to the sharp call.
 */

export interface StampIconDef {
  /** Stable key, persisted in CardDesign.stampIcon. */
  readonly key: string
  /** German label for the picker UI. */
  readonly label: string
  readonly path: string
  readonly fillRule: 'nonzero' | 'evenodd'
}

export const STAMP_ICONS = [
  {
    key: 'coffee',
    label: 'Kaffee',
    fillRule: 'nonzero',
    path: 'M4 4h12v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V4Zm13 2h1.6a3.9 3.9 0 0 1 0 7.8H17v-2.2h1.6a1.7 1.7 0 0 0 0-3.4H17V6Z',
  },
  {
    key: 'pizza',
    label: 'Pizza',
    fillRule: 'evenodd',
    path: 'M3 4.2C5.7 2.8 8.8 2 12 2s6.3.8 9 2.2L12 22 3 4.2ZM9 6.9a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8ZM15 8a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 15 8Zm-3 5a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 12 13Z',
  },
  {
    key: 'scissors',
    label: 'Schere',
    // Rings are cut with reverse-wound inner circles (nonzero) rather than evenodd, so
    // the blades may overlap the handles without punching holes into them.
    fillRule: 'nonzero',
    path: 'M16.79 1.99 6.59 17.19l1.82 1.22L18.61 3.21ZM5.39 3.21l10.2 15.2 1.82-1.22L7.21 1.99ZM3.7 19a2.9 2.9 0 1 1 5.8 0 2.9 2.9 0 1 1-5.8 0Zm1.55 0a1.35 1.35 0 1 0 2.7 0 1.35 1.35 0 1 0-2.7 0Zm9.25 0a2.9 2.9 0 1 1 5.8 0 2.9 2.9 0 1 1-5.8 0Zm1.55 0a1.35 1.35 0 1 0 2.7 0 1.35 1.35 0 1 0-2.7 0Z',
  },
  {
    key: 'ice-cream',
    label: 'Eis',
    fillRule: 'nonzero',
    path: 'M12 1.5A6.5 6.5 0 0 0 5.5 8c0 .35.03.68.08 1h12.84c.05-.32.08-.65.08-1A6.5 6.5 0 0 0 12 1.5zM6.1 11h11.8l-4.95 11.3a1 1 0 0 1-1.9 0L6.1 11z',
  },
  {
    key: 'doener',
    label: 'Döner',
    fillRule: 'evenodd',
    path: 'M4.9 6.6C4.9 4.1 8 2 12 2s7.1 2.1 7.1 4.6c0 .6-.2 1.2-.5 1.7l-5.1 12.4a1.6 1.6 0 0 1-3 0L5.4 8.3a3 3 0 0 1-.5-1.7ZM6.9 7.2l.7 1.7h8.8l.7-1.7c-1.4.8-3.2 1.2-5.1 1.2s-3.7-.4-5.1-1.2Z',
  },
  {
    key: 'cupcake',
    label: 'Cupcake',
    fillRule: 'nonzero',
    path: 'M6.5 10h11l-1.2 8.2a2 2 0 0 1-2 1.8H9.7a2 2 0 0 1-2-1.8L6.5 10zM12 2a3 3 0 0 1 2.9 2.3 3 3 0 0 1 1.9 5.2H7.2A3 3 0 0 1 9.1 4.3 3 3 0 0 1 12 2z',
  },
  {
    key: 'nail-polish',
    label: 'Nagellack',
    fillRule: 'evenodd',
    path: 'M9 2h6v3.2l1.6 1.8a3 3 0 0 1 .8 2v10.5a2.5 2.5 0 0 1-2.5 2.5H9.1a2.5 2.5 0 0 1-2.5-2.5V9a3 3 0 0 1 .8-2L9 5.2V2Zm-.4 9v3.5h6.8V11H8.6Z',
  },
  {
    key: 'heart',
    label: 'Herz',
    fillRule: 'nonzero',
    path: 'M12 21.1 4.3 13.6a5 5 0 0 1 7.1-7l.6.6.6-.6a5 5 0 1 1 7.1 7L12 21.1z',
  },
  {
    key: 'star',
    label: 'Stern',
    fillRule: 'nonzero',
    path: 'M12 2.2l3 6.2 6.8 1-4.9 4.8 1.2 6.8L12 17.8 5.9 21l1.2-6.8L2.2 9.4l6.8-1 3-6.2z',
  },
  {
    key: 'check',
    label: 'Haken',
    fillRule: 'nonzero',
    path: 'M20.3 5.3a1.5 1.5 0 0 1 0 2.1L10.2 17.5a1.5 1.5 0 0 1-2.1 0l-4.4-4.4a1.5 1.5 0 1 1 2.1-2.1l3.4 3.3 9-9a1.5 1.5 0 0 1 2.1 0z',
  },
  {
    key: 'paw',
    label: 'Pfote',
    fillRule: 'nonzero',
    path: 'M8.5 3.2a2.6 2.6 0 0 1 2.1 3.5A2.6 2.6 0 0 1 6.4 7a2.6 2.6 0 0 1 2.1-3.8zm7 0A2.6 2.6 0 0 1 17.6 7a2.6 2.6 0 0 1-4.2-.3 2.6 2.6 0 0 1 2.1-3.5zM3.9 9.2a2.4 2.4 0 0 1 2.4 3.2 2.4 2.4 0 0 1-3.9.4 2.4 2.4 0 0 1 1.5-3.6zm16.2 0a2.4 2.4 0 0 1 1.5 3.6 2.4 2.4 0 0 1-3.9-.4 2.4 2.4 0 0 1 2.4-3.2zM12 11.8c2.6 0 5.6 3 5.6 5.6 0 1.9-1.4 3.2-3.3 3.2-.9 0-1.6-.3-2.3-.3s-1.4.3-2.3.3c-1.9 0-3.3-1.3-3.3-3.2 0-2.6 3-5.6 5.6-5.6z',
  },
  {
    key: 'beer',
    label: 'Bier',
    fillRule: 'evenodd',
    path: 'M5 4h11v3h1.8A2.2 2.2 0 0 1 20 9.2v4.6a2.2 2.2 0 0 1-2.2 2.2H16v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4Zm11 5v5h1.8a.2.2 0 0 0 .2-.2V9.2a.2.2 0 0 0-.2-.2H16Z',
  },
  {
    key: 'burger',
    label: 'Burger',
    fillRule: 'nonzero',
    path: 'M12 2.5c4.6 0 8.4 2.4 8.4 5.4 0 .6-.5 1.1-1.1 1.1H4.7c-.6 0-1.1-.5-1.1-1.1 0-3 3.8-5.4 8.4-5.4zM3.6 11h16.8a1.1 1.1 0 0 1 0 2.2H3.6a1.1 1.1 0 0 1 0-2.2zm.6 4.2h15.6c.4 0 .7.4.6.8-.5 2.8-3.9 5-8.4 5s-7.9-2.2-8.4-5c-.1-.4.2-.8.6-.8z',
  },
  {
    key: 'flower',
    label: 'Blume',
    fillRule: 'evenodd',
    path: 'M12 2a3 3 0 0 1 3 3c0 .6-.2 1.2-.5 1.7A3 3 0 0 1 19 9a3 3 0 0 1-2.1 2.9A3 3 0 0 1 19 15a3 3 0 0 1-4.5 2.6A3 3 0 0 1 12 21a3 3 0 0 1-2.5-3.4A3 3 0 0 1 5 15a3 3 0 0 1 2.1-3.1A3 3 0 0 1 5 9a3 3 0 0 1 4.5-2.3A3 3 0 0 1 9 5a3 3 0 0 1 3-3Zm0 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  },
] as const satisfies readonly StampIconDef[]

export type StampIconKey = (typeof STAMP_ICONS)[number]['key']

export const STAMP_ICON_KEYS = STAMP_ICONS.map((i) => i.key) as readonly StampIconKey[]

const BY_KEY = new Map<string, StampIconDef>(STAMP_ICONS.map((i) => [i.key, i]))

export function getStampIcon(key: string): StampIconDef | undefined {
  return BY_KEY.get(key)
}

/**
 * Resolves whatever is stored in `CardDesign.stampIcon` to a drawable definition,
 * falling back to the default so a broken value never produces an empty strip.
 */
export function resolveStampIcon(key: string): StampIconDef {
  return BY_KEY.get(key) ?? BY_KEY.get('star')!
}

/** `emoji:1f600` / `emoji:1f469-200d-1f373` */
export const EMOJI_ICON_PREFIX = 'emoji:'
/** Icon comes from an uploaded asset referenced by `stampIconAssetId`. */
export const CUSTOM_ICON_KEY = 'custom'

export function isEmojiIcon(key: string): boolean {
  return key.startsWith(EMOJI_ICON_PREFIX) && /^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/.test(key.slice(EMOJI_ICON_PREFIX.length))
}

export function isLibraryIcon(key: string): boolean {
  return BY_KEY.has(key)
}

import { DEFAULT_CARD_DESIGN } from './defaults'
import type { CardDesignInput } from './schema'

/**
 * Industry presets. Each one has to look finished with zero further input — these are the
 * 30-second demo in a sales conversation, so colours, icon, stamp count and copy all come
 * pre-filled and pre-checked for contrast.
 */

export interface CardTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Emoji shown on the template tile — decorative only, never rendered into a pass. */
  readonly badge: string
  readonly design: Pick<
    CardDesignInput,
    | 'backgroundColor'
    | 'foregroundColor'
    | 'labelColor'
    | 'stampGoal'
    | 'stampIcon'
    | 'emptyStampStyle'
    | 'rewardText'
    | 'programName'
    | 'cardTitle'
    | 'stampLabel'
  >
}

export const CARD_TEMPLATES: readonly CardTemplate[] = [
  {
    id: 'barbershop',
    name: 'Barbershop',
    description: 'Dunkel, hoher Kontrast, Schere als Stempel.',
    badge: '💈',
    design: {
      backgroundColor: '#121212',
      foregroundColor: '#f5f0e6',
      labelColor: '#b9a37e',
      stampGoal: 8,
      stampIcon: 'scissors',
      emptyStampStyle: 'outline',
      rewardText: 'Jeder 8. Haarschnitt gratis',
      programName: 'Treuekarte',
      cardTitle: 'Schnitt sammeln',
      stampLabel: 'Schnitte',
    },
  },
  {
    id: 'cafe',
    name: 'Café',
    description: 'Warmes Braun, Kaffeetasse, Klassiker mit 10 Stempeln.',
    badge: '☕',
    design: {
      backgroundColor: '#3b2418',
      foregroundColor: '#fdf6ec',
      labelColor: '#d7b899',
      stampGoal: 10,
      stampIcon: 'coffee',
      emptyStampStyle: 'outline',
      rewardText: 'Jeder 10. Kaffee gratis',
      programName: 'Kaffeekarte',
      cardTitle: 'Kaffee sammeln',
      stampLabel: 'Kaffee',
    },
  },
  {
    id: 'baeckerei',
    name: 'Bäckerei',
    description: 'Heller Auftritt, Cupcake-Stempel, 12 Felder.',
    badge: '🥐',
    design: {
      backgroundColor: '#f7efe1',
      foregroundColor: '#5a3d1e',
      labelColor: '#8a6b43',
      stampGoal: 12,
      stampIcon: 'cupcake',
      emptyStampStyle: 'dashed',
      rewardText: 'Jedes 12. Gebäck gratis',
      programName: 'Bäckerkarte',
      cardTitle: 'Sammeln & sparen',
      stampLabel: 'Stempel',
    },
  },
  {
    id: 'pizzeria',
    name: 'Pizzeria',
    description: 'Italienisches Rot-Grün, Pizza-Stempel.',
    badge: '🍕',
    design: {
      backgroundColor: '#8c1c13',
      foregroundColor: '#fff6e5',
      labelColor: '#f0c987',
      stampGoal: 10,
      stampIcon: 'pizza',
      emptyStampStyle: 'outline',
      rewardText: 'Jede 10. Pizza gratis',
      programName: 'Pizzakarte',
      cardTitle: 'Pizza sammeln',
      stampLabel: 'Pizzen',
    },
  },
  {
    id: 'eisdiele',
    name: 'Eisdiele',
    description: 'Pastellblau, Eis-Stempel, kurze Karte mit 6 Feldern.',
    badge: '🍦',
    design: {
      backgroundColor: '#1f6f8b',
      foregroundColor: '#ffffff',
      labelColor: '#bfe3ef',
      stampGoal: 6,
      stampIcon: 'ice-cream',
      emptyStampStyle: 'transparent',
      rewardText: 'Jede 6. Kugel gratis',
      programName: 'Eiskarte',
      cardTitle: 'Kugeln sammeln',
      stampLabel: 'Kugeln',
    },
  },
  {
    id: 'nagelstudio',
    name: 'Nagelstudio',
    description: 'Beere auf Creme, Nagellack-Stempel.',
    badge: '💅',
    design: {
      backgroundColor: '#4a1237',
      foregroundColor: '#ffeaf4',
      labelColor: '#e0a8c6',
      stampGoal: 6,
      stampIcon: 'nail-polish',
      emptyStampStyle: 'outline',
      rewardText: 'Jede 6. Behandlung 50 % günstiger',
      programName: 'Beautykarte',
      cardTitle: 'Termine sammeln',
      stampLabel: 'Termine',
    },
  },
  {
    id: 'waschstrasse',
    name: 'Waschstraße',
    description: 'Technisches Blau, Haken-Stempel, 5 Wäschen.',
    badge: '🚗',
    design: {
      backgroundColor: '#0f2a4a',
      foregroundColor: '#e8f3ff',
      labelColor: '#95bde6',
      stampGoal: 5,
      stampIcon: 'check',
      emptyStampStyle: 'outline',
      rewardText: 'Jede 5. Wäsche gratis',
      programName: 'Waschkarte',
      cardTitle: 'Wäschen sammeln',
      stampLabel: 'Wäschen',
    },
  },
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Zurückhaltendes Grau, Stern-Stempel — Basis für eigenes Branding.',
    badge: '⭐',
    design: {
      backgroundColor: '#1a1a1a',
      foregroundColor: '#ffffff',
      labelColor: '#cccccc',
      stampGoal: 10,
      stampIcon: 'star',
      emptyStampStyle: 'outline',
      rewardText: 'Jeder 10. Besuch wird belohnt',
      programName: 'Treuekarte',
      cardTitle: null,
      stampLabel: 'Stempel',
    },
  },
]

export function getTemplate(id: string): CardTemplate | undefined {
  return CARD_TEMPLATES.find((t) => t.id === id)
}

/**
 * Applies a template on top of an existing design, keeping everything the template does
 * not talk about (uploaded assets, back fields, geo, barcode).
 */
export function applyTemplate(current: CardDesignInput, template: CardTemplate): CardDesignInput {
  return { ...current, ...template.design }
}

export function templateAsDesign(template: CardTemplate): CardDesignInput {
  return { ...DEFAULT_CARD_DESIGN, ...template.design }
}

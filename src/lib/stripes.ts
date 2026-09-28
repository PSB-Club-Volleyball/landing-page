import type { StripeSkill } from '../types'

// Display order and labels. Skills are volleyball skills; traits are
// character stripes, shown separately on profiles.
export const STRIPE_SKILLS: StripeSkill[] = ['serving', 'passing', 'setting', 'hitting', 'blocking', 'digging']
export const STRIPE_TRAITS: StripeSkill[] = ['hustle', 'teammate']

export const STRIPE_LABELS: Record<StripeSkill, string> = {
  serving: 'Serving',
  passing: 'Passing',
  setting: 'Setting',
  hitting: 'Hitting',
  blocking: 'Blocking',
  digging: 'Digging',
  hustle: 'Hustle',
  teammate: 'Good teammate',
}

export function stripeCount(n: number): string {
  // "Kudos" is the same singular and plural.
  return `${n} kudos`
}

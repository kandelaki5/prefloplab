import {
  POSITIONS, VS_OPENERS, VS3BET_OPENERS,
  heroesFacing, threebettorsFor,
  raiseSixths, vsOpenSixths, vs3betSixths,
  type AnySeat, type Facing, type Position,
} from "@/lib/ranges";

/** One drillable situation. The trainer deals these at random; the /range
 *  pages give each one a crawlable URL of its own. */
export type Spot =
  | { kind: "rfi"; hero: Position }
  | { kind: "vs"; hero: AnySeat; opener: Position }
  | { kind: "vs3bet"; hero: Position; threebettor: AnySeat };

const SEAT_NAMES: Record<string, string> = {
  UTG: "UTG",
  HJ: "hijack",
  CO: "cutoff",
  BTN: "button",
  SB: "small blind",
  BB: "big blind",
};

/** Every spot we hold a chart for, in the order they're listed on /range. */
export const SPOTS: Spot[] = [
  ...POSITIONS.map((hero): Spot => ({ kind: "rfi", hero })),
  ...VS_OPENERS.flatMap((opener) =>
    heroesFacing(opener).map((hero): Spot => ({ kind: "vs", hero, opener }))
  ),
  ...VS3BET_OPENERS.flatMap((hero) =>
    threebettorsFor(hero).map((threebettor): Spot => ({ kind: "vs3bet", hero, threebettor }))
  ),
];

export function spotSlug(s: Spot): string {
  const low = (x: string) => x.toLowerCase();
  if (s.kind === "rfi") return `${low(s.hero)}-opening-range`;
  if (s.kind === "vs") return `${low(s.hero)}-vs-${low(s.opener)}-raise`;
  return `${low(s.hero)}-vs-${low(s.threebettor)}-3bet`;
}

export function spotFromSlug(slug: string): Spot | undefined {
  return SPOTS.find((s) => spotSlug(s) === slug);
}

/** Page title — also the search phrase each page is meant to answer. */
export function spotTitle(s: Spot): string {
  if (s.kind === "rfi") return `${s.hero} Opening Range (6-max)`;
  if (s.kind === "vs") return `${s.hero} vs ${s.opener} Raise — Defending Range`;
  return `${s.hero} vs ${s.threebettor} 3-Bet — Response Range`;
}

export function spotHeading(s: Spot): string {
  if (s.kind === "rfi") return `${s.hero} opening range`;
  if (s.kind === "vs") return `${s.hero} vs ${s.opener} raise`;
  return `${s.hero} vs ${s.threebettor} 3-bet`;
}

export function spotBlurb(s: Spot): string {
  if (s.kind === "rfi") {
    return `Which hands to open-raise from ${SEAT_NAMES[s.hero]} when everyone has folded to you, in a 6-max cash game at 100bb.`;
  }
  if (s.kind === "vs") {
    return `How to defend from the ${SEAT_NAMES[s.hero]} after the ${SEAT_NAMES[s.opener]} opens: which hands 3-bet, which call, and which fold.`;
  }
  return `You opened from the ${SEAT_NAMES[s.hero]} and the ${SEAT_NAMES[s.threebettor]} 3-bet. Which hands 4-bet, which call, and which fold.`;
}

/** Actions this spot offers. Unopened pots are raise-or-fold; everything
 *  else has a call in between. */
export function spotIsRaiseFold(s: Spot): boolean {
  return s.kind === "rfi";
}

/** {raise, call} in sixths, or null when hero never holds the hand here
 *  (only possible facing a 3-bet, where hero must have opened first). */
export function spotSixths(s: Spot, hand: string): Facing | null {
  if (s.kind === "rfi") return { raise: raiseSixths(s.hero, hand), call: 0 };
  if (s.kind === "vs") return vsOpenSixths(s.hero, s.opener, hand);
  return vs3betSixths(s.hero, s.threebettor, hand);
}

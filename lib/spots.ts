import {
  POSITIONS, SEATS, VS_OPENERS, VS3BET_OPENERS,
  heroesFacing, threebettorsFor,
  isMixed, isVsOpenMixed, isVs3betMixed,
  raiseSixths, vsOpenSixths, vs3betSixths,
  resolveAction, resolveVsOpenAction, resolveVs3betAction,
  type AnySeat, type Facing, type FacingAction, type Position,
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

/** What the die says to do with this hand here. */
export function spotResolve(s: Spot, hand: string, die: number): FacingAction {
  if (s.kind === "rfi") return resolveAction(s.hero, hand, die);
  if (s.kind === "vs") return resolveVsOpenAction(s.hero, s.opener, hand, die);
  return resolveVs3betAction(s.hero, s.threebettor, hand, die);
}

/** True when the chart splits this hand between actions, so the die decides. */
export function spotIsMixed(s: Spot, hand: string): boolean {
  if (s.kind === "rfi") return isMixed(s.hero, hand);
  if (s.kind === "vs") return isVsOpenMixed(s.hero, s.opener, hand);
  return isVs3betMixed(s.hero, s.threebettor, hand);
}

/** Compact one-line description for feedback lines and mistake lists. */
export function spotLabel(s: Spot): string {
  if (s.kind === "rfi") return s.hero;
  if (s.kind === "vs") return `${s.opener} raise → ${s.hero}`;
  return `${s.hero} opens, ${s.threebettor} 3-bets`;
}

/* =========================
   PICKING A SPOT
   Everything below is derived from SPOTS, so the picker can only ever
   offer combinations we actually hold a chart for.
========================= */

export type SpotKind = Spot["kind"];

/** The seat hero is up against, or null in an unopened pot. */
export function spotBot(s: Spot): AnySeat | null {
  if (s.kind === "rfi") return null;
  return s.kind === "vs" ? s.opener : s.threebettor;
}

/** Seats hero can sit in for this kind of spot, in table order. */
export function heroesForKind(kind: SpotKind): AnySeat[] {
  const heroes = new Set(SPOTS.filter((s) => s.kind === kind).map((s) => s.hero as AnySeat));
  return SEATS.filter((seat) => heroes.has(seat));
}

/** Opponent seats available once hero's seat is fixed, in table order. */
export function botsForHero(kind: SpotKind, hero: AnySeat): AnySeat[] {
  const bots = new Set(
    SPOTS.filter((s) => s.kind === kind && s.hero === hero)
      .map(spotBot)
      .filter((b): b is AnySeat => b !== null)
  );
  return SEATS.filter((seat) => bots.has(seat));
}

/** Any seat, i.e. "deal me a different opponent every hand". */
export const ANY_SEAT = "any" as const;

/** The spots a picked selection draws from: one when the opponent's seat is
 *  fixed, all of hero's opponents when it is `ANY_SEAT`. */
export function spotPool(
  kind: SpotKind,
  hero: AnySeat,
  bot: AnySeat | typeof ANY_SEAT | null
): Spot[] {
  return SPOTS.filter(
    (s) =>
      s.kind === kind &&
      s.hero === hero &&
      (kind === "rfi" || bot === ANY_SEAT || spotBot(s) === bot)
  );
}

/** Heading for a whole selection, which may cover several spots. */
export function poolHeading(
  kind: SpotKind,
  hero: AnySeat,
  bot: AnySeat | typeof ANY_SEAT | null
): string {
  if (kind === "rfi") return `${hero} opening range`;
  const who = bot === ANY_SEAT ? "any seat" : bot;
  return kind === "vs" ? `${hero} vs ${who} raise` : `${hero} vs ${who} 3-bet`;
}

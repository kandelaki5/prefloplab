/**
 * Preflop RFI (open-raise) ranges.
 *
 * These are our own simplified, hand-picked ranges, tuned to land close to
 * standard 100bb 6-max opening frequencies and cross-checked against
 * reference charts — not a copy of any solver's exact output.
 *
 * Most hands are pure (always Raise, or always Fold). A curated set of
 * "boundary" hands are genuinely mixed, stored in sixths (0-6): a hand at
 * N/6 is raised when a rolled die shows N or lower. That mirrors how real
 * players execute a mixed GTO frequency at the table — roll something
 * random, act on a threshold — instead of pretending every hand has one
 * clean answer.
 */

export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB";
export type Action = "Raise" | "Fold";

export const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];

// BB can never open (there's no one left to raise into), but it can face
// one — so "facing an open" scenarios need a wider position type than the
// RFI ones do.
export type AnySeat = Position | "BB";
export type FacingAction = "Fold" | "Call" | "Raise";
export const SEATS: AnySeat[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// Ranks ordered high -> low. Index = distance from Ace.
export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
export type Rank = (typeof RANKS)[number];

const rankIndex = (r: string) => RANKS.indexOf(r as Rank);

/**
 * Parses shorthand range tokens into concrete hand codes.
 *   "44+"    -> 44, 55, 66, ... AA
 *   "K7s+"   -> K7s, K8s, ... KQs
 *   "AJo+"   -> AJo, AQo, AKo
 *   "76s"    -> 76s (single hand, no expansion)
 */
function parseToken(token: string): string[] {
  const plus = token.endsWith("+");
  const body = plus ? token.slice(0, -1) : token;

  // Pair, e.g. "44" / "44+"
  if (body.length === 2 && body[0] === body[1]) {
    if (!plus) return [body];
    const i = rankIndex(body[0]);
    return RANKS.slice(0, i + 1).map((r) => r + r);
  }

  // Suited / offsuit, e.g. "K7s" / "K7s+" / "AJo+"
  const [high, low, suffix] = body;
  if (!plus) return [body];

  const hi = rankIndex(high);
  const lo = rankIndex(low);
  const hands: string[] = [];
  for (let l = lo; l > hi; l--) {
    hands.push(high + RANKS[l] + suffix);
  }
  return hands;
}

function expandRange(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const t of tokens) parseToken(t).forEach((h) => set.add(h));
  return set;
}

// Pure-raise cores (everything here is 6/6 raise unless overridden below).
// Approx combo % noted for reference against standard 100bb RFI charts.
const RAW_RANGES: Record<Position, string[]> = {
  // ~17.8% combos
  UTG: ["55+", "A2s+", "K7s+", "Q9s+", "J9s+", "T9s", "98s", "87s", "AJo+", "KJo+", "QJo"],
  // ~21.6% combos
  HJ: ["22+", "A2s+", "K5s+", "Q8s+", "J8s+", "T8s+", "98s", "87s", "ATo+", "KJo+", "QJo"],
  // ~27.3% combos
  CO: [
    "22+", "A2s+", "K2s+", "Q5s+", "J6s+", "T6s+", "96s+", "87s", "86s", "76s", "65s",
    "ATo+", "KTo+", "QJo",
  ],
  // ~41.2% combos
  BTN: [
    "22+", "A2s+", "K2s+", "Q2s+", "J2s+", "T4s+", "93s+", "83s+", "73s+", "63s+",
    "54s", "53s", "43s", "A7o+", "K9o+", "QTo+", "JTo",
  ],
  // ~48.4% combos — raise-or-fold only (limps folded into raises)
  SB: [
    "22+", "A2s+", "K2s+", "Q2s+", "J2s+", "T2s+", "92s+", "82s+", "72s+", "62s+",
    "52s+", "42s+", "32s", "A2o+", "K7o+", "Q9o+",
  ],
};

export const RFI_RANGES: Record<Position, Set<string>> = Object.fromEntries(
  POSITIONS.map((pos) => [pos, expandRange(RAW_RANGES[pos])])
) as Record<Position, Set<string>>;

// Boundary hands that are genuinely mixed, in sixths of a raise (1-5).
// Anything not listed here is pure: 6/6 if it's in RAW_RANGES, 0/6 otherwise.
const RAW_MIXES: Record<Position, Record<string, number>> = {
  UTG: {
    "K7s": 5, "K6s": 1, "K5s": 1,
    "Q9s": 5,
    "J9s": 5,
    "T9s": 5,
    "98s": 5, "87s": 5,
    "76s": 3, "65s": 2, "54s": 1,
    "44": 1,
    "KJo": 5, "QJo": 4,
    "ATo": 1, "KTo": 1, "QTo": 1,
  },
  HJ: {
    "22": 3, "33": 4, "44": 5,
    "K5s": 3, "K6s": 4,
    "Q8s": 3, "Q9s": 5,
    "J8s": 3, "J9s": 5,
    "T8s": 3, "T9s": 5,
    "98s": 4, "87s": 4,
    "76s": 2, "65s": 1,
    "ATo": 4, "KTo": 1, "QTo": 1,
    "QJo": 4,
  },
  CO: {
    "22": 4, "33": 5,
    "K2s": 3, "K3s": 4, "K4s": 5,
    "Q5s": 3, "Q6s": 4, "Q7s": 5,
    "J6s": 3, "J7s": 4, "J8s": 5,
    "T6s": 3, "T7s": 4, "T8s": 5,
    "96s": 3, "97s": 4, "98s": 5,
    "65s": 4, "76s": 5, "86s": 5,
    "ATo": 5, "KTo": 3, "QTo": 1, "JTo": 1,
    "QJo": 5,
  },
  BTN: {
    "22": 5,
    "J2s": 4, "J3s": 5,
    "T4s": 4, "T5s": 5,
    "93s": 4, "94s": 5,
    "83s": 4, "84s": 5,
    "73s": 4, "74s": 5,
    "63s": 4, "64s": 5,
    "43s": 4, "53s": 5,
    "A7o": 4, "A8o": 5,
    "K9o": 3, "KTo": 4,
    "QTo": 3,
    "JTo": 2,
  },
  SB: {
    "32s": 4, "42s": 5,
    "K7o": 4, "K8o": 5,
    "Q9o": 4, "QTo": 5,
  },
};

/** How many sixths of a raise a hand gets at a position (0-6). 0 = pure
 *  fold, 6 = pure raise, 1-5 = mixed (resolved by a die roll). */
export function raiseSixths(position: Position, hand: string): number {
  const override = RAW_MIXES[position][hand];
  if (override !== undefined) return override;
  return RFI_RANGES[position].has(hand) ? 6 : 0;
}

export function isMixed(position: Position, hand: string): boolean {
  const s = raiseSixths(position, hand);
  return s > 0 && s < 6;
}

/** The correct action for a hand at a position, given a die roll (1-6) —
 *  the roll only matters when the hand is mixed; pure hands ignore it.
 *  Low rolls are the passive end (Fold), high rolls the aggressive end
 *  (Raise): a hand with N/6 raise gets the top N faces (die > 6-N raises). */
export function resolveAction(position: Position, hand: string, die: number): Action {
  return die > 6 - raiseSixths(position, hand) ? "Raise" : "Fold";
}

/** Number of combos behind a given hand code (pair=6, suited=4, offsuit=12). */
export function comboCount(hand: string): number {
  if (hand.length === 2) return 6; // pair
  return hand.endsWith("s") ? 4 : 12;
}

/** All 169 hand codes, laid out as a 13x13 grid (row-major), matching the
 *  standard chart convention: diagonal = pairs, upper-right triangle =
 *  suited, lower-left triangle = offsuit. */
export const HAND_GRID: string[][] = RANKS.map((rowRank, i) =>
  RANKS.map((colRank, j) => {
    if (i === j) return rowRank + rowRank;
    if (j > i) return rowRank + colRank + "s";
    return colRank + rowRank + "o";
  })
);

export const ALL_HANDS: string[] = HAND_GRID.flat();

/**
 * Facing-an-open ranges: hero acts after someone already raised. Three
 * actions now — Fold, Call, Raise (3-bet) — each hand split in sixths the
 * same way as the RFI ranges.
 *
 * One chart per (opener, hero) pair, read straight from the reference
 * images. Unlike the vs-3bet charts these have no greyed-out cells: hero
 * can hold any hand when facing a raise, so all 169 are live. Fold is
 * left implicit — raise + call + fold always sums to six, so a hand in
 * neither list folds. That is arithmetic, not a default.
 */
export type Facing = { raise: number; call: number };

type VsOpenSpot = {
  raise: string[];
  call: string[];
  mixes: Record<string, Facing>;
};

const VS_DATA: Partial<Record<Position, Partial<Record<AnySeat, VsOpenSpot>>>> = {
  UTG: {
    HJ: {
      raise: [
        "AA", "AKs", "AQs", "AJs", "ATs", "A5s", "AKo", "KK", "KQs", "KJs", "KTs", "QQ", "JJ", "TT",
      ],
      call: [],
      mixes: {
        "A9s": { raise: 2, call: 0 }, "A8s": { raise: 2, call: 0 }, "A7s": { raise: 1, call: 0 },
        "A4s": { raise: 5, call: 0 }, "AQo": { raise: 5, call: 0 }, "KQo": { raise: 2, call: 0 },
        "QJs": { raise: 3, call: 0 }, "JTs": { raise: 1, call: 0 }, "T9s": { raise: 1, call: 0 },
        "99": { raise: 4, call: 0 }, "88": { raise: 2, call: 0 }, "87s": { raise: 2, call: 0 },
        "77": { raise: 1, call: 0 }, "76s": { raise: 3, call: 0 }, "65s": { raise: 4, call: 0 },
        "54s": { raise: 3, call: 0 },
      },
    },
    CO: {
      raise: [
        "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "KK", "KQs", "KJs", "KTs", "QQ", "QJs", "JJ",
        "TT", "99",
      ],
      call: [],
      mixes: {
        "AA": { raise: 0, call: 2 }, "AKs": { raise: 0, call: 3 }, "A9s": { raise: 2, call: 0 },
        "A8s": { raise: 3, call: 0 }, "A7s": { raise: 2, call: 0 }, "AQo": { raise: 5, call: 0 },
        "KQo": { raise: 2, call: 0 }, "JTs": { raise: 2, call: 0 }, "T9s": { raise: 1, call: 0 },
        "88": { raise: 2, call: 0 }, "87s": { raise: 2, call: 0 }, "77": { raise: 2, call: 0 },
        "76s": { raise: 3, call: 0 }, "65s": { raise: 4, call: 0 }, "54s": { raise: 3, call: 0 },
      },
    },
    BTN: {
      raise: ["KK"],
      call: [],
      mixes: {
        "AA": { raise: 0, call: 1 }, "AKs": { raise: 1, call: 2 }, "AQs": { raise: 5, call: 1 },
        "AJs": { raise: 3, call: 3 }, "ATs": { raise: 3, call: 3 }, "A9s": { raise: 3, call: 3 },
        "A8s": { raise: 5, call: 1 }, "A7s": { raise: 3, call: 1 }, "A5s": { raise: 4, call: 2 },
        "A4s": { raise: 4, call: 2 }, "A3s": { raise: 4, call: 2 }, "AKo": { raise: 4, call: 2 },
        "KQs": { raise: 4, call: 2 }, "KJs": { raise: 3, call: 3 }, "KTs": { raise: 4, call: 2 },
        "K9s": { raise: 4, call: 1 }, "AQo": { raise: 3, call: 3 }, "KQo": { raise: 3, call: 2 },
        "QQ": { raise: 5, call: 1 }, "QJs": { raise: 4, call: 2 }, "QTs": { raise: 3, call: 3 },
        "AJo": { raise: 1, call: 1 }, "JJ": { raise: 3, call: 3 }, "JTs": { raise: 2, call: 4 },
        "J9s": { raise: 0, call: 1 }, "TT": { raise: 3, call: 3 }, "T9s": { raise: 3, call: 3 },
        "99": { raise: 2, call: 4 }, "98s": { raise: 1, call: 2 }, "88": { raise: 2, call: 4 },
        "87s": { raise: 2, call: 1 }, "77": { raise: 2, call: 4 }, "76s": { raise: 2, call: 2 },
        "66": { raise: 1, call: 3 }, "65s": { raise: 3, call: 3 }, "55": { raise: 1, call: 3 },
        "54s": { raise: 3, call: 3 }, "44": { raise: 0, call: 1 }, "33": { raise: 0, call: 1 },
        "22": { raise: 0, call: 1 },
      },
    },
    SB: {
      raise: ["AA", "AKs", "AQs", "KK", "KQs", "QQ"],
      call: [],
      mixes: {
        "AJs": { raise: 2, call: 4 }, "ATs": { raise: 3, call: 3 }, "A9s": { raise: 1, call: 3 },
        "A8s": { raise: 1, call: 1 }, "A5s": { raise: 5, call: 1 }, "A4s": { raise: 5, call: 1 },
        "A3s": { raise: 0, call: 1 }, "AKo": { raise: 5, call: 1 }, "KJs": { raise: 4, call: 2 },
        "KTs": { raise: 4, call: 2 }, "AQo": { raise: 2, call: 3 }, "KQo": { raise: 0, call: 1 },
        "QJs": { raise: 4, call: 2 }, "QTs": { raise: 3, call: 2 }, "JJ": { raise: 4, call: 2 },
        "JTs": { raise: 3, call: 3 }, "TT": { raise: 3, call: 3 }, "T9s": { raise: 1, call: 1 },
        "99": { raise: 2, call: 4 }, "98s": { raise: 0, call: 1 }, "88": { raise: 2, call: 4 },
        "87s": { raise: 1, call: 1 }, "77": { raise: 2, call: 4 }, "76s": { raise: 1, call: 1 },
        "66": { raise: 1, call: 2 }, "65s": { raise: 2, call: 1 }, "55": { raise: 1, call: 2 },
        "54s": { raise: 2, call: 1 }, "44": { raise: 0, call: 1 }, "33": { raise: 0, call: 1 },
        "22": { raise: 0, call: 1 },
      },
    },
    BB: {
      raise: ["AKs", "KK", "KQs", "QQ"],
      call: [
        "A9s", "K4s", "K3s", "AQo", "KQo", "Q8s", "Q7s", "KJo", "QJo", "T7s", "99", "97s", "96s",
        "88", "86s", "85s", "77", "75s", "74s", "66", "64s", "63s", "55", "53s", "52s", "44", "42s",
        "33", "22",
      ],
      mixes: {
        "AQs": { raise: 4, call: 2 }, "AJs": { raise: 1, call: 5 }, "ATs": { raise: 2, call: 4 },
        "A8s": { raise: 1, call: 5 }, "A7s": { raise: 1, call: 5 }, "A6s": { raise: 1, call: 5 },
        "A5s": { raise: 4, call: 2 }, "A4s": { raise: 4, call: 2 }, "A3s": { raise: 1, call: 5 },
        "A2s": { raise: 1, call: 5 }, "AKo": { raise: 4, call: 2 }, "KJs": { raise: 4, call: 2 },
        "KTs": { raise: 3, call: 3 }, "K9s": { raise: 1, call: 5 }, "K8s": { raise: 1, call: 5 },
        "K7s": { raise: 1, call: 5 }, "K6s": { raise: 1, call: 5 }, "K5s": { raise: 2, call: 4 },
        "K2s": { raise: 0, call: 5 }, "QJs": { raise: 5, call: 1 }, "QTs": { raise: 2, call: 4 },
        "Q9s": { raise: 1, call: 5 }, "Q6s": { raise: 0, call: 5 }, "Q5s": { raise: 0, call: 5 },
        "Q4s": { raise: 0, call: 1 }, "AJo": { raise: 1, call: 5 }, "JJ": { raise: 1, call: 5 },
        "JTs": { raise: 3, call: 3 }, "J9s": { raise: 1, call: 5 }, "J8s": { raise: 1, call: 5 },
        "J7s": { raise: 0, call: 5 }, "ATo": { raise: 1, call: 5 }, "KTo": { raise: 0, call: 2 },
        "QTo": { raise: 0, call: 3 }, "JTo": { raise: 0, call: 5 }, "TT": { raise: 1, call: 5 },
        "T9s": { raise: 1, call: 5 }, "T8s": { raise: 1, call: 5 }, "T6s": { raise: 0, call: 3 },
        "A9o": { raise: 0, call: 1 }, "T9o": { raise: 0, call: 1 }, "98s": { raise: 1, call: 5 },
        "95s": { raise: 0, call: 2 }, "98o": { raise: 0, call: 1 }, "87s": { raise: 2, call: 4 },
        "76s": { raise: 1, call: 5 }, "65s": { raise: 2, call: 4 }, "65o": { raise: 0, call: 1 },
        "54s": { raise: 2, call: 4 }, "43s": { raise: 1, call: 5 },
      },
    },
  },
  HJ: {
    CO: {
      raise: [
        "AA", "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "KK", "KQs", "KJs", "KTs", "AQo", "QQ",
        "QJs", "JJ", "TT", "99",
      ],
      call: [],
      mixes: {
        "A9s": { raise: 5, call: 0 }, "A8s": { raise: 4, call: 0 }, "A7s": { raise: 3, call: 0 },
        "A3s": { raise: 1, call: 0 }, "K9s": { raise: 1, call: 0 }, "KQo": { raise: 3, call: 0 },
        "QTs": { raise: 2, call: 0 }, "AJo": { raise: 2, call: 0 }, "JTs": { raise: 4, call: 0 },
        "T9s": { raise: 1, call: 0 }, "88": { raise: 4, call: 0 }, "87s": { raise: 1, call: 0 },
        "77": { raise: 3, call: 0 }, "76s": { raise: 3, call: 0 }, "66": { raise: 1, call: 0 },
        "65s": { raise: 4, call: 0 }, "54s": { raise: 3, call: 0 },
      },
    },
    BTN: {
      raise: ["AA", "AKs", "AQs", "KK", "QQ"],
      call: [],
      mixes: {
        "AJs": { raise: 4, call: 2 }, "ATs": { raise: 3, call: 3 }, "A9s": { raise: 4, call: 2 },
        "A8s": { raise: 5, call: 1 }, "A7s": { raise: 5, call: 1 }, "A6s": { raise: 2, call: 0 },
        "A5s": { raise: 5, call: 1 }, "A4s": { raise: 4, call: 2 }, "A3s": { raise: 4, call: 2 },
        "AKo": { raise: 5, call: 1 }, "KQs": { raise: 4, call: 2 }, "KJs": { raise: 5, call: 1 },
        "KTs": { raise: 4, call: 2 }, "K9s": { raise: 5, call: 1 }, "AQo": { raise: 4, call: 2 },
        "KQo": { raise: 4, call: 2 }, "QJs": { raise: 4, call: 2 }, "QTs": { raise: 4, call: 2 },
        "AJo": { raise: 3, call: 1 }, "KJo": { raise: 0, call: 1 }, "JJ": { raise: 4, call: 2 },
        "JTs": { raise: 3, call: 3 }, "J9s": { raise: 2, call: 1 }, "TT": { raise: 4, call: 2 },
        "T9s": { raise: 4, call: 2 }, "99": { raise: 3, call: 3 }, "98s": { raise: 1, call: 1 },
        "88": { raise: 3, call: 3 }, "87s": { raise: 2, call: 1 }, "77": { raise: 3, call: 3 },
        "76s": { raise: 3, call: 1 }, "66": { raise: 2, call: 3 }, "65s": { raise: 4, call: 2 },
        "55": { raise: 1, call: 2 }, "54s": { raise: 3, call: 2 }, "44": { raise: 0, call: 1 },
        "33": { raise: 0, call: 1 },
      },
    },
    SB: {
      raise: ["AQs", "AKo", "KK", "KQs", "QQ"],
      call: [],
      mixes: {
        "AA": { raise: 0, call: 2 }, "AKs": { raise: 0, call: 3 }, "AJs": { raise: 4, call: 2 },
        "ATs": { raise: 3, call: 3 }, "A9s": { raise: 3, call: 3 }, "A8s": { raise: 2, call: 1 },
        "A7s": { raise: 0, call: 1 }, "A5s": { raise: 5, call: 1 }, "A4s": { raise: 5, call: 1 },
        "A3s": { raise: 1, call: 1 }, "KJs": { raise: 5, call: 1 }, "KTs": { raise: 4, call: 2 },
        "K9s": { raise: 1, call: 1 }, "AQo": { raise: 4, call: 2 }, "KQo": { raise: 1, call: 1 },
        "QJs": { raise: 5, call: 1 }, "QTs": { raise: 4, call: 2 }, "AJo": { raise: 0, call: 1 },
        "JJ": { raise: 5, call: 1 }, "JTs": { raise: 4, call: 2 }, "TT": { raise: 4, call: 2 },
        "T9s": { raise: 1, call: 1 }, "99": { raise: 3, call: 3 }, "98s": { raise: 0, call: 1 },
        "88": { raise: 3, call: 3 }, "87s": { raise: 1, call: 1 }, "77": { raise: 3, call: 3 },
        "76s": { raise: 1, call: 1 }, "66": { raise: 1, call: 2 }, "65s": { raise: 1, call: 1 },
        "55": { raise: 0, call: 2 }, "54s": { raise: 1, call: 1 }, "44": { raise: 0, call: 1 },
        "33": { raise: 0, call: 1 }, "22": { raise: 0, call: 1 },
      },
    },
    BB: {
      raise: ["AKo", "KK", "KQs", "KJs", "QQ", "QJs"],
      call: [
        "K9s", "K8s", "K3s", "K2s", "Q7s", "Q6s", "Q5s", "Q4s", "KJo", "QJo", "J8s", "J7s", "KTo",
        "JTo", "T7s", "A9o", "99", "96s", "88", "86s", "85s", "77", "75s", "74s", "66", "64s",
        "63s", "55", "53s", "52s", "44", "42s", "33", "22",
      ],
      mixes: {
        "AA": { raise: 0, call: 2 }, "AKs": { raise: 0, call: 3 }, "AQs": { raise: 5, call: 1 },
        "AJs": { raise: 1, call: 5 }, "ATs": { raise: 1, call: 5 }, "A9s": { raise: 2, call: 4 },
        "A8s": { raise: 1, call: 5 }, "A7s": { raise: 1, call: 5 }, "A6s": { raise: 2, call: 4 },
        "A5s": { raise: 5, call: 1 }, "A4s": { raise: 3, call: 3 }, "A3s": { raise: 1, call: 5 },
        "A2s": { raise: 1, call: 5 }, "KTs": { raise: 4, call: 2 }, "K7s": { raise: 1, call: 5 },
        "K6s": { raise: 1, call: 5 }, "K5s": { raise: 1, call: 5 }, "K4s": { raise: 1, call: 5 },
        "AQo": { raise: 1, call: 5 }, "KQo": { raise: 1, call: 5 }, "QTs": { raise: 5, call: 1 },
        "Q9s": { raise: 2, call: 4 }, "Q8s": { raise: 1, call: 5 }, "Q3s": { raise: 0, call: 3 },
        "AJo": { raise: 1, call: 5 }, "JJ": { raise: 4, call: 2 }, "JTs": { raise: 5, call: 1 },
        "J9s": { raise: 1, call: 5 }, "J6s": { raise: 0, call: 1 }, "ATo": { raise: 1, call: 5 },
        "QTo": { raise: 0, call: 5 }, "TT": { raise: 1, call: 5 }, "T9s": { raise: 2, call: 4 },
        "T8s": { raise: 1, call: 5 }, "T6s": { raise: 0, call: 3 }, "T9o": { raise: 0, call: 1 },
        "98s": { raise: 1, call: 5 }, "97s": { raise: 1, call: 5 }, "95s": { raise: 0, call: 4 },
        "A8o": { raise: 0, call: 1 }, "98o": { raise: 0, call: 1 }, "87s": { raise: 2, call: 4 },
        "87o": { raise: 0, call: 1 }, "76s": { raise: 2, call: 4 }, "76o": { raise: 0, call: 1 },
        "65s": { raise: 2, call: 4 }, "A5o": { raise: 0, call: 3 }, "65o": { raise: 0, call: 1 },
        "54s": { raise: 3, call: 3 }, "54o": { raise: 0, call: 1 }, "43s": { raise: 1, call: 5 },
        "32s": { raise: 0, call: 1 },
      },
    },
  },
  CO: {
    BTN: {
      raise: ["AA", "AQs", "A5s", "AKo", "KK", "KJs", "QQ", "JJ"],
      call: [],
      mixes: {
        "AJs": { raise: 5, call: 1 }, "ATs": { raise: 5, call: 1 }, "A9s": { raise: 5, call: 1 },
        "A8s": { raise: 5, call: 1 }, "A7s": { raise: 5, call: 1 }, "A6s": { raise: 5, call: 1 },
        "A4s": { raise: 5, call: 1 }, "A3s": { raise: 5, call: 1 }, "A2s": { raise: 1, call: 0 },
        "KQs": { raise: 5, call: 1 }, "KTs": { raise: 5, call: 1 }, "K9s": { raise: 5, call: 1 },
        "K8s": { raise: 1, call: 0 }, "AQo": { raise: 5, call: 1 }, "KQo": { raise: 5, call: 1 },
        "QJs": { raise: 5, call: 1 }, "QTs": { raise: 4, call: 2 }, "Q9s": { raise: 3, call: 0 },
        "AJo": { raise: 5, call: 1 }, "KJo": { raise: 2, call: 1 }, "JTs": { raise: 5, call: 1 },
        "J9s": { raise: 5, call: 1 }, "ATo": { raise: 2, call: 0 }, "KTo": { raise: 1, call: 0 },
        "TT": { raise: 5, call: 1 }, "T9s": { raise: 5, call: 1 }, "99": { raise: 5, call: 1 },
        "98s": { raise: 1, call: 1 }, "88": { raise: 5, call: 1 }, "87s": { raise: 2, call: 0 },
        "77": { raise: 5, call: 1 }, "76s": { raise: 4, call: 1 }, "66": { raise: 5, call: 1 },
        "65s": { raise: 4, call: 1 }, "55": { raise: 2, call: 1 }, "54s": { raise: 3, call: 1 },
        "44": { raise: 0, call: 1 },
      },
    },
    SB: {
      raise: ["AA", "AKs", "AQs", "AJs", "AKo", "KK", "KQs", "KJs", "QQ", "QJs", "JJ"],
      call: [],
      mixes: {
        "ATs": { raise: 3, call: 3 }, "A9s": { raise: 3, call: 3 }, "A8s": { raise: 3, call: 2 },
        "A7s": { raise: 1, call: 1 }, "A5s": { raise: 5, call: 1 }, "A4s": { raise: 5, call: 1 },
        "A3s": { raise: 1, call: 1 }, "KTs": { raise: 5, call: 1 }, "K9s": { raise: 3, call: 1 },
        "AQo": { raise: 5, call: 1 }, "KQo": { raise: 3, call: 2 }, "QTs": { raise: 4, call: 2 },
        "AJo": { raise: 2, call: 2 }, "JTs": { raise: 5, call: 1 }, "J9s": { raise: 3, call: 1 },
        "TT": { raise: 5, call: 1 }, "T9s": { raise: 3, call: 1 }, "99": { raise: 4, call: 2 },
        "88": { raise: 3, call: 3 }, "87s": { raise: 1, call: 1 }, "77": { raise: 3, call: 3 },
        "76s": { raise: 1, call: 1 }, "66": { raise: 3, call: 2 }, "65s": { raise: 1, call: 1 },
        "55": { raise: 1, call: 2 }, "54s": { raise: 1, call: 1 }, "44": { raise: 0, call: 1 },
      },
    },
    BB: {
      raise: ["AQs", "AKo", "KK", "KQs", "QQ", "QJs", "JJ"],
      call: [
        "ATs", "K8s", "K2s", "Q7s", "Q5s", "Q4s", "Q3s", "Q2s", "J6s", "J4s", "QTo", "JTo", "T6s",
        "A9o", "97s", "A8o", "88", "86s", "85s", "77", "75s", "74s", "64s", "63s", "55", "53s",
        "52s", "44", "42s", "33", "22",
      ],
      mixes: {
        "AA": { raise: 0, call: 2 }, "AKs": { raise: 1, call: 1 }, "AJs": { raise: 1, call: 5 },
        "A9s": { raise: 1, call: 5 }, "A8s": { raise: 1, call: 5 }, "A7s": { raise: 1, call: 5 },
        "A6s": { raise: 2, call: 4 }, "A5s": { raise: 4, call: 2 }, "A4s": { raise: 4, call: 2 },
        "A3s": { raise: 1, call: 5 }, "A2s": { raise: 1, call: 5 }, "KJs": { raise: 5, call: 1 },
        "KTs": { raise: 2, call: 4 }, "K9s": { raise: 2, call: 4 }, "K7s": { raise: 1, call: 5 },
        "K6s": { raise: 1, call: 5 }, "K5s": { raise: 2, call: 4 }, "K4s": { raise: 1, call: 5 },
        "K3s": { raise: 1, call: 5 }, "AQo": { raise: 2, call: 4 }, "KQo": { raise: 1, call: 5 },
        "QTs": { raise: 5, call: 1 }, "Q9s": { raise: 2, call: 4 }, "Q8s": { raise: 2, call: 4 },
        "Q6s": { raise: 2, call: 4 }, "AJo": { raise: 1, call: 5 }, "KJo": { raise: 1, call: 5 },
        "QJo": { raise: 1, call: 5 }, "JTs": { raise: 5, call: 1 }, "J9s": { raise: 4, call: 2 },
        "J8s": { raise: 2, call: 4 }, "J7s": { raise: 1, call: 5 }, "J5s": { raise: 0, call: 5 },
        "J3s": { raise: 0, call: 4 }, "ATo": { raise: 1, call: 5 }, "KTo": { raise: 1, call: 5 },
        "TT": { raise: 3, call: 3 }, "T9s": { raise: 5, call: 1 }, "T8s": { raise: 1, call: 5 },
        "T7s": { raise: 1, call: 5 }, "K9o": { raise: 0, call: 4 }, "Q9o": { raise: 0, call: 1 },
        "J9o": { raise: 0, call: 2 }, "T9o": { raise: 0, call: 5 }, "99": { raise: 1, call: 5 },
        "98s": { raise: 1, call: 5 }, "96s": { raise: 1, call: 5 }, "95s": { raise: 0, call: 5 },
        "98o": { raise: 0, call: 2 }, "87s": { raise: 2, call: 4 }, "84s": { raise: 0, call: 2 },
        "A7o": { raise: 0, call: 2 }, "87o": { raise: 0, call: 2 }, "76s": { raise: 3, call: 3 },
        "76o": { raise: 0, call: 2 }, "66": { raise: 1, call: 5 }, "65s": { raise: 2, call: 4 },
        "A5o": { raise: 1, call: 5 }, "65o": { raise: 0, call: 1 }, "54s": { raise: 3, call: 3 },
        "A4o": { raise: 0, call: 2 }, "54o": { raise: 0, call: 1 }, "43s": { raise: 2, call: 4 },
        "32s": { raise: 0, call: 4 },
      },
    },
  },
  BTN: {
    SB: {
      raise: [
        "AA", "AKs", "AQs", "AJs", "ATs", "A5s", "A4s", "AKo", "KK", "KQs", "KJs", "KTs", "K9s",
        "AQo", "KQo", "QQ", "QJs", "QTs", "AJo", "JJ", "JTs", "J9s", "TT", "T9s", "99", "88", "77",
      ],
      call: [],
      mixes: {
        "A9s": { raise: 5, call: 1 }, "A8s": { raise: 5, call: 1 }, "A7s": { raise: 5, call: 1 },
        "A6s": { raise: 1, call: 0 }, "A3s": { raise: 1, call: 1 }, "Q9s": { raise: 3, call: 1 },
        "KJo": { raise: 3, call: 0 }, "ATo": { raise: 2, call: 1 }, "T8s": { raise: 5, call: 0 },
        "98s": { raise: 1, call: 0 }, "87s": { raise: 1, call: 0 }, "76s": { raise: 1, call: 0 },
        "66": { raise: 5, call: 1 }, "65s": { raise: 1, call: 0 }, "55": { raise: 2, call: 1 },
        "54s": { raise: 1, call: 0 },
      },
    },
    BB: {
      raise: [
        "AA", "AKs", "AQs", "AJs", "AKo", "KK", "KQs", "AQo", "QQ", "JJ", "JTs", "J9s", "TT", "T9s",
        "T8s",
      ],
      call: [
        "A9s", "A8s", "A7s", "A3s", "K8s", "K4s", "K2s", "Q7s", "Q5s", "Q4s", "Q3s", "Q2s", "J4s",
        "J3s", "J2s", "Q9o", "J9o", "86s", "85s", "75s", "74s", "64s", "63s", "53s", "52s", "44",
        "42s", "33", "22",
      ],
      mixes: {
        "ATs": { raise: 1, call: 5 }, "A6s": { raise: 1, call: 5 }, "A5s": { raise: 5, call: 1 },
        "A4s": { raise: 2, call: 4 }, "A2s": { raise: 1, call: 5 }, "KJs": { raise: 1, call: 5 },
        "KTs": { raise: 2, call: 4 }, "K9s": { raise: 2, call: 4 }, "K7s": { raise: 1, call: 5 },
        "K6s": { raise: 2, call: 4 }, "K5s": { raise: 1, call: 5 }, "K3s": { raise: 1, call: 5 },
        "KQo": { raise: 2, call: 4 }, "QJs": { raise: 5, call: 1 }, "QTs": { raise: 5, call: 1 },
        "Q9s": { raise: 4, call: 2 }, "Q8s": { raise: 1, call: 5 }, "Q6s": { raise: 1, call: 5 },
        "AJo": { raise: 2, call: 4 }, "KJo": { raise: 2, call: 4 }, "QJo": { raise: 1, call: 5 },
        "J8s": { raise: 2, call: 4 }, "J7s": { raise: 4, call: 2 }, "J6s": { raise: 1, call: 5 },
        "J5s": { raise: 2, call: 4 }, "ATo": { raise: 1, call: 5 }, "KTo": { raise: 2, call: 4 },
        "QTo": { raise: 1, call: 5 }, "JTo": { raise: 1, call: 5 }, "T7s": { raise: 3, call: 3 },
        "T6s": { raise: 2, call: 4 }, "T5s": { raise: 0, call: 4 }, "A9o": { raise: 1, call: 5 },
        "K9o": { raise: 1, call: 5 }, "T9o": { raise: 1, call: 5 }, "99": { raise: 4, call: 2 },
        "98s": { raise: 3, call: 3 }, "97s": { raise: 1, call: 5 }, "96s": { raise: 1, call: 5 },
        "95s": { raise: 0, call: 1 }, "A8o": { raise: 1, call: 5 }, "K8o": { raise: 0, call: 1 },
        "T8o": { raise: 0, call: 3 }, "98o": { raise: 0, call: 2 }, "88": { raise: 1, call: 5 },
        "87s": { raise: 3, call: 3 }, "A7o": { raise: 1, call: 5 }, "87o": { raise: 0, call: 2 },
        "77": { raise: 1, call: 5 }, "76s": { raise: 3, call: 3 }, "A6o": { raise: 0, call: 2 },
        "76o": { raise: 0, call: 1 }, "66": { raise: 1, call: 5 }, "65s": { raise: 3, call: 3 },
        "A5o": { raise: 2, call: 4 }, "55": { raise: 1, call: 5 }, "54s": { raise: 3, call: 3 },
        "A4o": { raise: 1, call: 5 }, "43s": { raise: 1, call: 5 },
      },
    },
  },
  SB: {
    BB: {
      raise: [
        "AA", "AKs", "AQs", "AJs", "A5s", "AKo", "KK", "KQs", "KJs", "AQo", "QQ", "QJs", "JJ", "TT",
        "T9s",
      ],
      call: [
        "A9s", "A8s", "A7s", "A6s", "A2s", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
        "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q2s", "KJo", "QJo", "J9s", "J8s", "ATo", "JTo", "T8s",
        "T7s", "A9o", "97s", "96s", "86s", "85s", "87o", "75s", "74s", "73s", "64s", "63s", "53s",
        "52s", "44", "43s", "42s", "33", "32s", "22",
      ],
      mixes: {
        "ATs": { raise: 5, call: 1 }, "A4s": { raise: 4, call: 2 }, "A3s": { raise: 1, call: 5 },
        "KTs": { raise: 4, call: 2 }, "KQo": { raise: 1, call: 5 }, "QTs": { raise: 4, call: 2 },
        "Q4s": { raise: 1, call: 5 }, "Q3s": { raise: 1, call: 5 }, "AJo": { raise: 1, call: 5 },
        "JTs": { raise: 5, call: 1 }, "J7s": { raise: 1, call: 5 }, "J6s": { raise: 3, call: 3 },
        "J5s": { raise: 3, call: 3 }, "J4s": { raise: 3, call: 3 }, "J3s": { raise: 1, call: 5 },
        "J2s": { raise: 2, call: 4 }, "KTo": { raise: 1, call: 5 }, "QTo": { raise: 1, call: 5 },
        "T6s": { raise: 5, call: 1 }, "T5s": { raise: 3, call: 3 }, "T4s": { raise: 4, call: 2 },
        "T3s": { raise: 2, call: 4 }, "T2s": { raise: 2, call: 4 }, "K9o": { raise: 2, call: 4 },
        "Q9o": { raise: 2, call: 4 }, "J9o": { raise: 2, call: 4 }, "T9o": { raise: 1, call: 5 },
        "99": { raise: 4, call: 2 }, "98s": { raise: 5, call: 1 }, "95s": { raise: 3, call: 3 },
        "A8o": { raise: 1, call: 5 }, "K8o": { raise: 4, call: 2 }, "Q8o": { raise: 3, call: 3 },
        "J8o": { raise: 3, call: 3 }, "T8o": { raise: 3, call: 3 }, "98o": { raise: 1, call: 5 },
        "88": { raise: 2, call: 4 }, "87s": { raise: 5, call: 1 }, "84s": { raise: 1, call: 5 },
        "A7o": { raise: 3, call: 3 }, "K7o": { raise: 3, call: 3 }, "T7o": { raise: 1, call: 0 },
        "97o": { raise: 1, call: 1 }, "77": { raise: 1, call: 5 }, "76s": { raise: 5, call: 1 },
        "A6o": { raise: 3, call: 3 }, "K6o": { raise: 2, call: 1 }, "76o": { raise: 0, call: 5 },
        "66": { raise: 2, call: 4 }, "65s": { raise: 3, call: 3 }, "A5o": { raise: 1, call: 5 },
        "K5o": { raise: 1, call: 0 }, "65o": { raise: 0, call: 4 }, "55": { raise: 1, call: 5 },
        "54s": { raise: 4, call: 2 }, "A4o": { raise: 2, call: 4 }, "54o": { raise: 0, call: 3 },
        "A3o": { raise: 2, call: 4 }, "A2o": { raise: 4, call: 2 },
      },
    },
  },
};

const VS_SETS = new Map<string, { raise: Set<string>; call: Set<string> }>();
for (const [opener, heroes] of Object.entries(VS_DATA)) {
  for (const [hero, spot] of Object.entries(heroes)) {
    VS_SETS.set(`${opener}/${hero}`, { raise: new Set(spot.raise), call: new Set(spot.call) });
  }
}
export const VS_OPENERS: Position[] = Object.keys(VS_DATA) as Position[];

/** Seats that can face an open from `opener` (everyone who acts after them). */
export function heroesFacing(opener: Position): AnySeat[] {
  return SEATS.slice(SEATS.indexOf(opener) + 1);
}

/** {raise, call} in sixths for `hero` facing an open from `opener`.
 *  Fold is whatever sixths remain (6 - raise - call). */
export function vsOpenSixths(hero: AnySeat, opener: Position, hand: string): Facing {
  const spot = VS_DATA[opener]?.[hero];
  const sets = VS_SETS.get(`${opener}/${hero}`);
  if (!spot || !sets) return { raise: 0, call: 0 }; // no chart for this pair

  const mix = spot.mixes[hand];
  if (mix) return mix;
  if (sets.raise.has(hand)) return { raise: 6, call: 0 };
  if (sets.call.has(hand)) return { raise: 0, call: 6 };
  return { raise: 0, call: 0 }; // in neither list: hero folds
}

export function isVsOpenMixed(hero: AnySeat, opener: Position, hand: string): boolean {
  const { raise, call } = vsOpenSixths(hero, opener, hand);
  const fold = 6 - raise - call;
  return [raise, call, fold].filter((n) => n > 0).length > 1;
}

/** The correct action facing an open, given a die roll (1-6). Low rolls
 *  are the passive end (Fold), then Call, then Raise at the top — same
 *  aggression-ordered convention as the RFI resolver. */
export function resolveVsOpenAction(hero: AnySeat, opener: Position, hand: string, die: number): FacingAction {
  const { raise, call } = vsOpenSixths(hero, opener, hand);
  const fold = 6 - raise - call;
  if (die <= fold) return "Fold";
  if (die <= fold + call) return "Call";
  return "Raise";
}

/**
 * Facing-a-3bet ranges: hero already opened, someone behind them 3-bet,
 * action is back on hero. Fold / Call / Raise (4-bet) again in sixths —
 * "Raise" here folds together the chart's separate Raise and Allin
 * buttons, since our engine doesn't model bet sizes.
 *
 * Only hands hero could actually have opened are reachable here — the
 * reference chart shows the rest greyed out ("N/A"), and we do the same:
 * vs3betSixths returns null for any hand outside hero's RFI range.
 */
// One chart per (hero, 3bettor) PAIR. Facing a 3bet from the blinds is a
// different problem than facing one from the seat on your left, so these
// are deliberately not shared: an earlier version kept a single response
// per hero and reused it for every 3bettor, which got most pairs wrong.
//
// Every hand hero opens is listed explicitly — pure raise/call/fold, or a
// mix in sixths. A hand that is absent is one the chart greys out (hero
// never opened it), so there is no decision to make and nothing to guess.
type Vs3betSpot = {
  raise: string[];
  call: string[];
  fold: string[];
  mixes: Record<string, Facing>;
  // How often hero opens a hand they don't always open. Used only to deal
  // hands at realistic frequencies — never to score an answer.
  partial?: Record<string, number>;
};

const VS3BET_DATA: Partial<Record<Position, Partial<Record<AnySeat, Vs3betSpot>>>> = {
  UTG: {
    HJ: {
      raise: ["AA", "AKs", "KK"],
      call: ["54s", "44", "33", "22"],
      fold: [
        "A9s", "A8s", "A7s", "A6s", "A3s", "A2s", "K9s", "K8s", "K7s", "KQo", "Q9s", "AJo", "KJo",
        "QJo", "J9s", "ATo", "KTo", "QTo",
      ],
      mixes: {
        "AQs": { raise: 3, call: 3 }, "AJs": { raise: 3, call: 3 }, "ATs": { raise: 2, call: 3 },
        "A5s": { raise: 3, call: 2 }, "A4s": { raise: 0, call: 2 }, "AKo": { raise: 5, call: 1 },
        "KQs": { raise: 3, call: 3 }, "KJs": { raise: 2, call: 4 }, "KTs": { raise: 0, call: 1 },
        "AQo": { raise: 1, call: 1 }, "QQ": { raise: 4, call: 2 }, "QJs": { raise: 0, call: 2 },
        "QTs": { raise: 0, call: 1 }, "JJ": { raise: 2, call: 4 }, "JTs": { raise: 0, call: 3 },
        "TT": { raise: 1, call: 5 }, "T9s": { raise: 0, call: 2 }, "T8s": { raise: 0, call: 1 },
        "99": { raise: 1, call: 4 }, "98s": { raise: 1, call: 5 }, "88": { raise: 1, call: 3 },
        "87s": { raise: 2, call: 4 }, "77": { raise: 1, call: 3 }, "76s": { raise: 2, call: 4 },
        "66": { raise: 1, call: 3 }, "65s": { raise: 2, call: 4 }, "55": { raise: 0, call: 5 },
      },
      partial: {
        "K7s": 0.41, "QJo": 0.53, "J9s": 0.78, "KTo": 0.38, "QTo": 0.07, "T8s": 0.09, "98s": 0.17,
        "87s": 0.27, "76s": 0.34, "65s": 0.56, "55": 0.64, "54s": 0.37, "44": 0.3, "33": 0.2,
        "22": 0.14,
      },
    },
    CO: {
      raise: ["AA", "AKs", "KK"],
      call: ["98s", "54s", "44", "33", "22"],
      fold: [
        "A9s", "A8s", "A7s", "A6s", "A3s", "A2s", "K9s", "K8s", "K7s", "KQo", "Q9s", "AJo", "KJo",
        "QJo", "J9s", "ATo", "KTo", "QTo", "T8s",
      ],
      mixes: {
        "AQs": { raise: 3, call: 3 }, "AJs": { raise: 4, call: 2 }, "ATs": { raise: 3, call: 3 },
        "A5s": { raise: 3, call: 2 }, "A4s": { raise: 0, call: 2 }, "AKo": { raise: 5, call: 1 },
        "KQs": { raise: 3, call: 3 }, "KJs": { raise: 2, call: 4 }, "KTs": { raise: 1, call: 2 },
        "AQo": { raise: 1, call: 1 }, "QQ": { raise: 5, call: 1 }, "QJs": { raise: 1, call: 2 },
        "QTs": { raise: 0, call: 1 }, "JJ": { raise: 2, call: 4 }, "JTs": { raise: 1, call: 4 },
        "TT": { raise: 1, call: 5 }, "T9s": { raise: 0, call: 1 }, "99": { raise: 1, call: 5 },
        "88": { raise: 1, call: 4 }, "87s": { raise: 1, call: 5 }, "77": { raise: 1, call: 3 },
        "76s": { raise: 2, call: 4 }, "66": { raise: 1, call: 4 }, "65s": { raise: 2, call: 4 },
        "55": { raise: 0, call: 5 },
      },
      partial: {
        "K7s": 0.41, "QJo": 0.53, "J9s": 0.78, "KTo": 0.38, "QTo": 0.07, "T8s": 0.09, "98s": 0.17,
        "87s": 0.27, "76s": 0.34, "65s": 0.56, "55": 0.64, "54s": 0.37, "44": 0.3, "33": 0.2,
        "22": 0.09,
      },
    },
    BTN: {
      raise: ["AA", "AKs", "KK"],
      call: ["98s", "55", "54s", "44", "33"],
      fold: [
        "A8s", "A7s", "A6s", "A3s", "A2s", "K9s", "K8s", "K7s", "KQo", "Q9s", "AJo", "KJo", "QJo",
        "J9s", "ATo", "KTo", "QTo",
      ],
      mixes: {
        "AQs": { raise: 2, call: 4 }, "AJs": { raise: 3, call: 3 }, "ATs": { raise: 2, call: 4 },
        "A9s": { raise: 0, call: 3 }, "A5s": { raise: 4, call: 2 }, "A4s": { raise: 1, call: 2 },
        "AKo": { raise: 5, call: 1 }, "KQs": { raise: 2, call: 4 }, "KJs": { raise: 2, call: 4 },
        "KTs": { raise: 1, call: 5 }, "AQo": { raise: 1, call: 1 }, "QQ": { raise: 4, call: 2 },
        "QJs": { raise: 1, call: 4 }, "QTs": { raise: 0, call: 1 }, "JJ": { raise: 2, call: 4 },
        "JTs": { raise: 1, call: 5 }, "TT": { raise: 1, call: 5 }, "T9s": { raise: 0, call: 3 },
        "T8s": { raise: 0, call: 2 }, "99": { raise: 1, call: 5 }, "88": { raise: 1, call: 5 },
        "87s": { raise: 1, call: 5 }, "77": { raise: 1, call: 5 }, "76s": { raise: 1, call: 5 },
        "66": { raise: 1, call: 5 }, "65s": { raise: 1, call: 5 },
      },
      partial: {
        "A2s": 0.91, "K7s": 0.41, "QJo": 0.53, "J9s": 0.78, "KTo": 0.38, "QTo": 0.07, "T8s": 0.09,
        "98s": 0.17, "87s": 0.27, "76s": 0.34, "65s": 0.56, "55": 0.64, "54s": 0.37, "44": 0.3,
        "33": 0.2,
      },
    },
    SB: {
      raise: ["AA"],
      call: ["AQs", "AJs", "ATs", "KQs", "QQ", "JJ", "TT", "98s", "76s", "65s", "54s", "33", "22"],
      fold: [
        "A9s", "A7s", "A6s", "A2s", "K8s", "KQo", "Q9s", "AJo", "KJo", "QJo", "J9s", "ATo", "KTo",
        "QTo", "T8s",
      ],
      mixes: {
        "AKs": { raise: 2, call: 4 }, "A8s": { raise: 1, call: 0 }, "A5s": { raise: 2, call: 4 },
        "A4s": { raise: 2, call: 2 }, "A3s": { raise: 1, call: 0 }, "AKo": { raise: 3, call: 3 },
        "KK": { raise: 4, call: 2 }, "KJs": { raise: 3, call: 3 }, "KTs": { raise: 2, call: 3 },
        "K9s": { raise: 1, call: 0 }, "K7s": { raise: 1, call: 0 }, "AQo": { raise: 1, call: 0 },
        "QJs": { raise: 0, call: 5 }, "QTs": { raise: 0, call: 1 }, "JTs": { raise: 0, call: 4 },
        "T9s": { raise: 0, call: 3 }, "99": { raise: 0, call: 5 }, "88": { raise: 0, call: 4 },
        "87s": { raise: 1, call: 5 }, "77": { raise: 0, call: 3 }, "66": { raise: 0, call: 3 },
        "55": { raise: 0, call: 2 }, "44": { raise: 0, call: 3 },
      },
      partial: {
        "A2s": 0.88, "K7s": 0.41, "QJo": 0.53, "J9s": 0.78, "KTo": 0.38, "QTo": 0.07, "T8s": 0.09,
        "98s": 0.17, "87s": 0.27, "76s": 0.34, "65s": 0.56, "55": 0.64, "54s": 0.37, "44": 0.3,
        "33": 0.2, "22": 0.14,
      },
    },
    BB: {
      raise: [],
      call: ["AQs", "AJs", "ATs", "KQs", "QQ", "JJ", "87s", "76s", "65s"],
      fold: [
        "A6s", "A2s", "K9s", "K8s", "K7s", "KQo", "Q9s", "AJo", "KJo", "QJo", "J9s", "ATo", "KTo",
        "QTo", "T8s",
      ],
      mixes: {
        "AA": { raise: 5, call: 1 }, "AKs": { raise: 3, call: 3 }, "A9s": { raise: 1, call: 2 },
        "A8s": { raise: 1, call: 1 }, "A7s": { raise: 1, call: 0 }, "A5s": { raise: 1, call: 5 },
        "A4s": { raise: 1, call: 2 }, "A3s": { raise: 1, call: 0 }, "AKo": { raise: 3, call: 3 },
        "KK": { raise: 3, call: 3 }, "KJs": { raise: 1, call: 4 }, "KTs": { raise: 1, call: 1 },
        "AQo": { raise: 1, call: 0 }, "QJs": { raise: 0, call: 3 }, "QTs": { raise: 0, call: 1 },
        "JTs": { raise: 0, call: 2 }, "TT": { raise: 0, call: 5 }, "T9s": { raise: 0, call: 2 },
        "99": { raise: 0, call: 4 }, "98s": { raise: 0, call: 3 }, "88": { raise: 0, call: 3 },
        "77": { raise: 0, call: 3 }, "66": { raise: 0, call: 3 }, "55": { raise: 0, call: 2 },
        "54s": { raise: 0, call: 4 }, "44": { raise: 0, call: 2 }, "33": { raise: 0, call: 3 },
      },
      partial: {
        "A2s": 0.9, "K7s": 0.41, "QJo": 0.53, "J9s": 0.78, "KTo": 0.38, "QTo": 0.07, "T8s": 0.09,
        "98s": 0.17, "87s": 0.27, "76s": 0.34, "65s": 0.56, "55": 0.64, "54s": 0.37, "44": 0.3,
        "33": 0.2,
      },
    },
  },
  HJ: {
    CO: {
      raise: ["AA", "AKs", "KK", "QQ"],
      call: ["54s", "44", "33", "22"],
      fold: [
        "A8s", "A7s", "A6s", "A3s", "A2s", "K9s", "K8s", "K7s", "K6s", "K5s", "KQo", "Q9s", "Q8s",
        "AJo", "KJo", "QJo", "J8s", "ATo", "KTo", "QTo", "JTo", "T8s", "A9o",
      ],
      mixes: {
        "AQs": { raise: 2, call: 4 }, "AJs": { raise: 3, call: 3 }, "ATs": { raise: 3, call: 3 },
        "A9s": { raise: 0, call: 1 }, "A5s": { raise: 3, call: 2 }, "A4s": { raise: 0, call: 2 },
        "AKo": { raise: 5, call: 1 }, "KQs": { raise: 3, call: 3 }, "KJs": { raise: 2, call: 4 },
        "KTs": { raise: 2, call: 4 }, "AQo": { raise: 2, call: 2 }, "QJs": { raise: 1, call: 4 },
        "QTs": { raise: 0, call: 2 }, "JJ": { raise: 3, call: 3 }, "JTs": { raise: 1, call: 5 },
        "J9s": { raise: 0, call: 1 }, "TT": { raise: 2, call: 4 }, "T9s": { raise: 0, call: 3 },
        "99": { raise: 1, call: 5 }, "98s": { raise: 0, call: 2 }, "88": { raise: 1, call: 5 },
        "87s": { raise: 1, call: 5 }, "77": { raise: 1, call: 4 }, "76s": { raise: 2, call: 4 },
        "66": { raise: 1, call: 4 }, "65s": { raise: 2, call: 4 }, "55": { raise: 0, call: 3 },
      },
      partial: {
        "K6s": 0.71, "K5s": 0.63, "Q8s": 0.52, "J8s": 0.11, "QTo": 0.55, "JTo": 0.33, "A9o": 0.6,
        "98s": 0.88, "87s": 0.36, "76s": 0.41, "65s": 0.65, "54s": 0.5, "44": 0.56, "33": 0.31,
        "22": 0.16,
      },
    },
    BTN: {
      raise: ["AA", "AKs", "KK"],
      call: ["54s", "44", "33", "22"],
      fold: [
        "A7s", "A6s", "A3s", "A2s", "K8s", "K7s", "K6s", "K5s", "KQo", "Q9s", "Q8s", "AJo", "KJo",
        "QJo", "J8s", "ATo", "KTo", "QTo", "JTo", "A9o",
      ],
      mixes: {
        "AQs": { raise: 2, call: 4 }, "AJs": { raise: 2, call: 4 }, "ATs": { raise: 3, call: 3 },
        "A9s": { raise: 1, call: 4 }, "A8s": { raise: 0, call: 1 }, "A5s": { raise: 3, call: 3 },
        "A4s": { raise: 1, call: 3 }, "AKo": { raise: 5, call: 1 }, "KQs": { raise: 2, call: 4 },
        "KJs": { raise: 3, call: 3 }, "KTs": { raise: 1, call: 5 }, "K9s": { raise: 0, call: 1 },
        "AQo": { raise: 3, call: 3 }, "QQ": { raise: 5, call: 1 }, "QJs": { raise: 1, call: 5 },
        "QTs": { raise: 1, call: 5 }, "JJ": { raise: 3, call: 3 }, "JTs": { raise: 1, call: 5 },
        "J9s": { raise: 0, call: 1 }, "TT": { raise: 2, call: 4 }, "T9s": { raise: 1, call: 4 },
        "T8s": { raise: 0, call: 1 }, "99": { raise: 1, call: 5 }, "98s": { raise: 0, call: 2 },
        "88": { raise: 1, call: 5 }, "87s": { raise: 1, call: 5 }, "77": { raise: 1, call: 5 },
        "76s": { raise: 1, call: 5 }, "66": { raise: 1, call: 5 }, "65s": { raise: 1, call: 5 },
        "55": { raise: 1, call: 4 },
      },
      partial: {
        "K6s": 0.71, "K5s": 0.63, "Q8s": 0.52, "J8s": 0.11, "QTo": 0.55, "JTo": 0.33, "A9o": 0.6,
        "98s": 0.88, "87s": 0.36, "76s": 0.41, "65s": 0.65, "54s": 0.5, "44": 0.56, "33": 0.31,
        "22": 0.17,
      },
    },
    SB: {
      raise: ["AA"],
      call: [
        "AQs", "AJs", "ATs", "KQs", "QQ", "QJs", "JTs", "TT", "99", "87s", "76s", "65s", "54s",
        "33", "22",
      ],
      fold: [
        "A7s", "A6s", "A2s", "K8s", "K7s", "K5s", "KQo", "Q9s", "Q8s", "KJo", "QJo", "J9s", "J8s",
        "ATo", "KTo", "QTo", "JTo", "T8s", "A9o",
      ],
      mixes: {
        "AKs": { raise: 4, call: 2 }, "A9s": { raise: 1, call: 1 }, "A8s": { raise: 1, call: 0 },
        "A5s": { raise: 2, call: 4 }, "A4s": { raise: 3, call: 3 }, "A3s": { raise: 1, call: 0 },
        "AKo": { raise: 2, call: 4 }, "KK": { raise: 4, call: 2 }, "KJs": { raise: 2, call: 4 },
        "KTs": { raise: 2, call: 4 }, "K9s": { raise: 2, call: 0 }, "K6s": { raise: 2, call: 0 },
        "AQo": { raise: 1, call: 1 }, "QTs": { raise: 0, call: 3 }, "AJo": { raise: 1, call: 0 },
        "JJ": { raise: 1, call: 5 }, "T9s": { raise: 0, call: 4 }, "98s": { raise: 0, call: 1 },
        "88": { raise: 1, call: 5 }, "77": { raise: 0, call: 4 }, "66": { raise: 0, call: 3 },
        "55": { raise: 0, call: 1 }, "44": { raise: 0, call: 2 },
      },
      partial: {
        "AA": 0.92, "AKs": 0.92, "AQs": 0.92, "AJs": 0.92, "ATs": 0.92, "A9s": 0.92, "A8s": 0.92,
        "A7s": 0.92, "A6s": 0.92, "A5s": 0.92, "A4s": 0.92, "A3s": 0.92, "A2s": 0.92, "K6s": 0.71,
        "K5s": 0.63, "Q8s": 0.52, "J8s": 0.11, "QTo": 0.55, "JTo": 0.33, "A9o": 0.6, "98s": 0.88,
        "87s": 0.36, "76s": 0.41, "65s": 0.65, "54s": 0.5, "44": 0.56, "33": 0.31, "22": 0.16,
      },
    },
    BB: {
      raise: [],
      call: ["AKs", "AQs", "AJs", "ATs", "KQs", "QQ", "QJs", "TT", "87s", "76s"],
      fold: [
        "A6s", "K8s", "K7s", "K6s", "K5s", "KQo", "Q9s", "Q8s", "AJo", "KJo", "QJo", "J9s", "J8s",
        "ATo", "KTo", "QTo", "JTo", "T8s", "A9o",
      ],
      mixes: {
        "AA": { raise: 5, call: 1 }, "A9s": { raise: 1, call: 4 }, "A8s": { raise: 1, call: 1 },
        "A7s": { raise: 1, call: 0 }, "A5s": { raise: 1, call: 5 }, "A4s": { raise: 1, call: 4 },
        "A3s": { raise: 2, call: 0 }, "A2s": { raise: 1, call: 0 }, "AKo": { raise: 4, call: 2 },
        "KK": { raise: 4, call: 2 }, "KJs": { raise: 1, call: 5 }, "KTs": { raise: 2, call: 4 },
        "K9s": { raise: 1, call: 0 }, "AQo": { raise: 1, call: 1 }, "QTs": { raise: 0, call: 3 },
        "JJ": { raise: 1, call: 5 }, "JTs": { raise: 0, call: 4 }, "T9s": { raise: 0, call: 2 },
        "99": { raise: 0, call: 5 }, "98s": { raise: 0, call: 1 }, "88": { raise: 0, call: 4 },
        "77": { raise: 0, call: 4 }, "66": { raise: 0, call: 3 }, "65s": { raise: 0, call: 4 },
        "55": { raise: 0, call: 2 }, "54s": { raise: 0, call: 4 }, "44": { raise: 0, call: 2 },
        "33": { raise: 0, call: 4 }, "22": { raise: 0, call: 2 },
      },
      partial: {
        "K6s": 0.71, "K5s": 0.63, "Q8s": 0.52, "J8s": 0.11, "QTo": 0.55, "JTo": 0.33, "A9o": 0.6,
        "98s": 0.88, "87s": 0.36, "76s": 0.41, "65s": 0.65, "54s": 0.5, "44": 0.56, "33": 0.31,
        "22": 0.17,
      },
    },
  },
  CO: {
    BTN: {
      raise: ["AA", "AKs", "AKo", "KK", "QQ"],
      call: ["54s", "33", "22"],
      fold: [
        "A7s", "A6s", "A2s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "Q9s", "Q8s", "Q7s", "Q6s",
        "Q5s", "KJo", "QJo", "J8s", "J7s", "ATo", "KTo", "QTo", "JTo", "T7s", "A9o", "K9o", "J9o",
        "T9o", "A8o", "A7o", "A5o",
      ],
      mixes: {
        "AQs": { raise: 3, call: 3 }, "AJs": { raise: 2, call: 4 }, "ATs": { raise: 4, call: 2 },
        "A9s": { raise: 2, call: 4 }, "A8s": { raise: 1, call: 4 }, "A5s": { raise: 4, call: 2 },
        "A4s": { raise: 2, call: 3 }, "A3s": { raise: 0, call: 1 }, "KQs": { raise: 5, call: 1 },
        "KJs": { raise: 4, call: 2 }, "KTs": { raise: 3, call: 3 }, "K9s": { raise: 1, call: 4 },
        "AQo": { raise: 4, call: 2 }, "KQo": { raise: 0, call: 2 }, "QJs": { raise: 3, call: 3 },
        "QTs": { raise: 1, call: 5 }, "AJo": { raise: 0, call: 1 }, "JJ": { raise: 5, call: 1 },
        "JTs": { raise: 2, call: 4 }, "J9s": { raise: 0, call: 3 }, "TT": { raise: 4, call: 2 },
        "T9s": { raise: 2, call: 4 }, "T8s": { raise: 0, call: 3 }, "99": { raise: 2, call: 4 },
        "98s": { raise: 0, call: 3 }, "97s": { raise: 0, call: 1 }, "88": { raise: 1, call: 5 },
        "87s": { raise: 1, call: 3 }, "86s": { raise: 0, call: 3 }, "77": { raise: 1, call: 5 },
        "76s": { raise: 1, call: 5 }, "66": { raise: 1, call: 5 }, "65s": { raise: 1, call: 5 },
        "55": { raise: 1, call: 5 }, "44": { raise: 0, call: 5 },
      },
      partial: {
        "K3s": 0.36, "Q5s": 0.18, "J7s": 0.59, "T7s": 0.55, "K9o": 0.28, "J9o": 0.12, "T9o": 0.21,
        "86s": 0.08, "A7o": 0.1, "76s": 0.76, "65s": 0.76, "A5o": 0.62, "54s": 0.56, "33": 0.9,
        "22": 0.41,
      },
    },
    SB: {
      raise: ["AA"],
      call: [
        "AQs", "AJs", "ATs", "KQs", "KJs", "QJs", "QTs", "JTs", "TT", "T9s", "99", "88", "77",
        "65s", "54s", "22",
      ],
      fold: [
        "A7s", "A6s", "A2s", "K8s", "K4s", "K3s", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "QJo", "J8s",
        "J7s", "ATo", "KTo", "QTo", "JTo", "T7s", "A9o", "K9o", "J9o", "T9o", "97s", "A8o", "86s",
        "A7o", "A5o",
      ],
      mixes: {
        "AKs": { raise: 4, call: 2 }, "A9s": { raise: 0, call: 5 }, "A8s": { raise: 2, call: 1 },
        "A5s": { raise: 2, call: 4 }, "A4s": { raise: 2, call: 4 }, "A3s": { raise: 2, call: 1 },
        "AKo": { raise: 3, call: 3 }, "KK": { raise: 5, call: 1 }, "KTs": { raise: 1, call: 5 },
        "K9s": { raise: 3, call: 1 }, "K7s": { raise: 1, call: 0 }, "K6s": { raise: 1, call: 0 },
        "K5s": { raise: 1, call: 0 }, "AQo": { raise: 2, call: 4 }, "KQo": { raise: 1, call: 0 },
        "QQ": { raise: 3, call: 3 }, "AJo": { raise: 1, call: 0 }, "KJo": { raise: 1, call: 0 },
        "JJ": { raise: 1, call: 5 }, "J9s": { raise: 0, call: 3 }, "T8s": { raise: 1, call: 1 },
        "98s": { raise: 0, call: 1 }, "87s": { raise: 0, call: 3 }, "76s": { raise: 0, call: 5 },
        "66": { raise: 0, call: 5 }, "55": { raise: 0, call: 2 }, "44": { raise: 0, call: 2 },
        "33": { raise: 0, call: 4 },
      },
      partial: {
        "K3s": 0.4, "Q5s": 0.21, "J7s": 0.6, "T7s": 0.56, "K9o": 0.3, "J9o": 0.13, "T9o": 0.23,
        "86s": 0.11, "A7o": 0.11, "76s": 0.77, "65s": 0.76, "A5o": 0.64, "54s": 0.57, "33": 0.9,
        "22": 0.41,
      },
    },
    BB: {
      raise: ["AA"],
      call: [
        "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs", "TT",
        "99", "88",
      ],
      fold: [
        "K8s", "K4s", "K3s", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "QJo", "J8s", "J7s", "ATo", "KTo",
        "QTo", "JTo", "T8s", "T7s", "A9o", "K9o", "J9o", "T9o", "97s", "A8o", "86s", "A7o", "A5o",
      ],
      mixes: {
        "A8s": { raise: 2, call: 3 }, "A7s": { raise: 3, call: 1 }, "A6s": { raise: 1, call: 0 },
        "A4s": { raise: 1, call: 5 }, "A3s": { raise: 2, call: 1 }, "A2s": { raise: 1, call: 0 },
        "AKo": { raise: 4, call: 2 }, "KK": { raise: 5, call: 1 }, "K9s": { raise: 3, call: 1 },
        "K7s": { raise: 1, call: 0 }, "K6s": { raise: 1, call: 0 }, "K5s": { raise: 1, call: 0 },
        "AQo": { raise: 3, call: 3 }, "KQo": { raise: 0, call: 1 }, "QQ": { raise: 2, call: 4 },
        "AJo": { raise: 1, call: 0 }, "KJo": { raise: 1, call: 0 }, "JJ": { raise: 1, call: 5 },
        "J9s": { raise: 0, call: 1 }, "T9s": { raise: 0, call: 4 }, "98s": { raise: 0, call: 1 },
        "87s": { raise: 0, call: 3 }, "77": { raise: 0, call: 5 }, "76s": { raise: 0, call: 4 },
        "66": { raise: 0, call: 5 }, "65s": { raise: 0, call: 3 }, "55": { raise: 0, call: 3 },
        "54s": { raise: 0, call: 4 }, "44": { raise: 0, call: 1 }, "33": { raise: 0, call: 2 },
        "22": { raise: 0, call: 2 },
      },
      partial: {
        "K3s": 0.36, "Q5s": 0.18, "J7s": 0.59, "T7s": 0.55, "K9o": 0.28, "J9o": 0.12, "T9o": 0.21,
        "86s": 0.08, "A7o": 0.1, "76s": 0.76, "65s": 0.76, "A5o": 0.62, "54s": 0.56, "33": 0.9,
        "22": 0.41,
      },
    },
  },
  BTN: {
    SB: {
      raise: ["KK"],
      call: [
        "AQs", "AJs", "ATs", "A9s", "A5s", "KQs", "KJs", "KTs", "AQo", "QJs", "QTs", "JTs", "T9s",
        "99", "88", "87s", "77", "76s", "66", "22",
      ],
      fold: [
        "A2s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s",
        "Q2s", "QJo", "J8s", "J7s", "J6s", "J5s", "J4s", "QTo", "JTo", "T7s", "T6s", "A9o", "K9o",
        "Q9o", "J9o", "T9o", "97s", "96s", "A8o", "K8o", "J8o", "T8o", "98o", "86s", "A7o", "75s",
        "A6o", "64s", "A5o", "A4o", "A3o",
      ],
      mixes: {
        "AA": { raise: 5, call: 1 }, "AKs": { raise: 4, call: 2 }, "A8s": { raise: 1, call: 5 },
        "A7s": { raise: 2, call: 2 }, "A6s": { raise: 1, call: 0 }, "A4s": { raise: 1, call: 5 },
        "A3s": { raise: 2, call: 3 }, "AKo": { raise: 5, call: 1 }, "K9s": { raise: 1, call: 5 },
        "K8s": { raise: 1, call: 1 }, "KQo": { raise: 1, call: 5 }, "QQ": { raise: 5, call: 1 },
        "Q9s": { raise: 2, call: 4 }, "AJo": { raise: 2, call: 4 }, "KJo": { raise: 1, call: 1 },
        "JJ": { raise: 4, call: 2 }, "J9s": { raise: 1, call: 5 }, "ATo": { raise: 2, call: 0 },
        "KTo": { raise: 1, call: 0 }, "TT": { raise: 2, call: 4 }, "T8s": { raise: 1, call: 5 },
        "98s": { raise: 1, call: 5 }, "65s": { raise: 1, call: 5 }, "55": { raise: 1, call: 5 },
        "54s": { raise: 1, call: 5 }, "44": { raise: 1, call: 5 }, "33": { raise: 0, call: 4 },
      },
      partial: {
        "Q2s": 0.67, "J4s": 0.83, "K8o": 0.83, "J8o": 0.44, "T8o": 0.79, "98o": 0.4, "64s": 0.29,
      },
    },
    BB: {
      raise: ["AKo", "KK", "QQ"],
      call: [
        "AQs", "AJs", "ATs", "A9s", "A8s", "A5s", "A4s", "KQs", "KJs", "KTs", "K9s", "QJs", "QTs",
        "JTs", "J9s", "T9s", "99", "88", "77", "66",
      ],
      fold: [
        "A2s", "K4s", "K3s", "K2s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s", "QJo", "J8s",
        "J7s", "J6s", "J5s", "J4s", "KTo", "QTo", "JTo", "T7s", "T6s", "A9o", "K9o", "Q9o", "J9o",
        "T9o", "97s", "96s", "A8o", "K8o", "J8o", "T8o", "98o", "86s", "A7o", "75s", "A6o", "64s",
        "A5o", "A4o", "A3o", "22",
      ],
      mixes: {
        "AA": { raise: 3, call: 3 }, "AKs": { raise: 4, call: 2 }, "A7s": { raise: 2, call: 4 },
        "A6s": { raise: 3, call: 0 }, "A3s": { raise: 2, call: 4 }, "K8s": { raise: 1, call: 2 },
        "K7s": { raise: 1, call: 0 }, "K6s": { raise: 0, call: 1 }, "K5s": { raise: 1, call: 0 },
        "AQo": { raise: 2, call: 4 }, "KQo": { raise: 2, call: 4 }, "Q9s": { raise: 2, call: 4 },
        "AJo": { raise: 3, call: 3 }, "KJo": { raise: 1, call: 2 }, "JJ": { raise: 4, call: 2 },
        "ATo": { raise: 1, call: 0 }, "TT": { raise: 2, call: 4 }, "T8s": { raise: 1, call: 5 },
        "98s": { raise: 1, call: 2 }, "87s": { raise: 0, call: 4 }, "76s": { raise: 0, call: 4 },
        "65s": { raise: 0, call: 3 }, "55": { raise: 1, call: 5 }, "54s": { raise: 0, call: 2 },
        "44": { raise: 0, call: 3 }, "33": { raise: 0, call: 2 },
      },
      partial: {
        "Q2s": 0.67, "J4s": 0.83, "K8o": 0.83, "J8o": 0.44, "T8o": 0.79, "98o": 0.4, "64s": 0.29,
      },
    },
  },
  SB: {
    BB: {
      raise: ["AA", "AKs", "AQs", "AKo", "KK", "QQ", "JJ"],
      call: [
        "AJs", "ATs", "A9s", "A8s", "A7s", "KQs", "KJs", "KTs", "K9s", "K8s", "QJs", "QTs", "Q9s",
        "JTs", "J9s", "99", "88", "77", "66", "65s", "55", "54s", "44", "33", "22",
      ],
      fold: [
        "K4s", "K3s", "K2s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s", "J7s", "J6s", "J5s", "J4s",
        "QTo", "T6s", "A9o", "K9o", "Q9o", "J9o", "T9o", "96s", "A8o", "K8o", "T8o", "98o", "86s",
        "85s", "A7o", "87o", "75s", "74s", "A6o", "64s", "A5o", "53s", "A4o", "A3o",
      ],
      mixes: {
        "A6s": { raise: 3, call: 3 }, "A5s": { raise: 1, call: 5 }, "A4s": { raise: 2, call: 4 },
        "A3s": { raise: 1, call: 5 }, "A2s": { raise: 3, call: 3 }, "K7s": { raise: 2, call: 4 },
        "K6s": { raise: 2, call: 4 }, "K5s": { raise: 2, call: 1 }, "AQo": { raise: 4, call: 2 },
        "KQo": { raise: 3, call: 3 }, "Q8s": { raise: 0, call: 5 }, "AJo": { raise: 4, call: 2 },
        "KJo": { raise: 3, call: 3 }, "QJo": { raise: 2, call: 2 }, "J8s": { raise: 1, call: 5 },
        "ATo": { raise: 4, call: 2 }, "KTo": { raise: 1, call: 1 }, "JTo": { raise: 1, call: 1 },
        "TT": { raise: 5, call: 1 }, "T9s": { raise: 1, call: 5 }, "T8s": { raise: 1, call: 5 },
        "T7s": { raise: 0, call: 2 }, "98s": { raise: 2, call: 4 }, "97s": { raise: 1, call: 4 },
        "87s": { raise: 1, call: 5 }, "76s": { raise: 1, call: 5 },
      },
      partial: {"K8o": 0.92, "T8o": 0.7, "98o": 0.72, "87o": 0.2, "74s": 0.47, "A3o": 0.32},
    },
  },
};

const VS3BET_SETS = new Map<string, { raise: Set<string>; call: Set<string>; fold: Set<string> }>();
for (const [hero, spots] of Object.entries(VS3BET_DATA)) {
  for (const [threebettor, spot] of Object.entries(spots)) {
    VS3BET_SETS.set(`${hero}/${threebettor}`, {
      raise: new Set(spot.raise),
      call: new Set(spot.call),
      fold: new Set(spot.fold),
    });
  }
}

/** Openers we have facing-3bet charts for. */
export const VS3BET_OPENERS: Position[] = Object.keys(VS3BET_DATA) as Position[];

/** Seats we have a real chart for, 3-betting `hero`'s open. */
export function threebettorsFor(hero: Position): AnySeat[] {
  return Object.keys(VS3BET_DATA[hero] ?? {}) as AnySeat[];
}

/** {raise, call} in sixths facing a 3-bet, or null when the chart greys the
 *  hand out — hero never opened it, so there is no decision to make. */
export function vs3betSixths(hero: Position, threebettor: AnySeat, hand: string): Facing | null {
  const spot = VS3BET_DATA[hero]?.[threebettor];
  const sets = VS3BET_SETS.get(`${hero}/${threebettor}`);
  if (!spot || !sets) return null;

  const mix = spot.mixes[hand];
  if (mix) return mix;
  if (sets.raise.has(hand)) return { raise: 6, call: 0 };
  if (sets.call.has(hand)) return { raise: 0, call: 6 };
  if (sets.fold.has(hand)) return { raise: 0, call: 0 };
  return null;
}

export function isVs3betMixed(hero: Position, threebettor: AnySeat, hand: string): boolean {
  const f = vs3betSixths(hero, threebettor, hand);
  if (!f) return false;
  const fold = 6 - f.raise - f.call;
  return [f.raise, f.call, fold].filter((n) => n > 0).length > 1;
}

/** Same low-passive/high-aggressive die convention as the other resolvers. */
export function resolveVs3betAction(hero: Position, threebettor: AnySeat, hand: string, die: number): FacingAction {
  const f = vs3betSixths(hero, threebettor, hand) ?? { raise: 0, call: 0 };
  const fold = 6 - f.raise - f.call;
  if (die <= fold) return "Fold";
  if (die <= fold + f.call) return "Call";
  return "Raise";
}

/** A hand hero would actually have opened in this exact spot, weighted by
 *  combo count and by how often the chart says they open it. */
export function sampleOpenedHand(hero: Position, threebettor: AnySeat): string {
  const spot = VS3BET_DATA[hero]?.[threebettor];
  if (!spot) return "AA";

  const hands = [...spot.raise, ...spot.call, ...spot.fold, ...Object.keys(spot.mixes)];
  const weight = (h: string) => comboCount(h) * (spot.partial?.[h] ?? 1);
  const total = hands.reduce((sum, h) => sum + weight(h), 0);
  let r = Math.random() * total;

  for (const h of hands) {
    r -= weight(h);
    if (r <= 0) return h;
  }
  return hands[hands.length - 1];
}

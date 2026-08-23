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
 * same way as the RFI ranges, cross-checked against reference charts.
 *
 * Keyed by opener first, then by hero seat. VS_OPENERS lists which opening
 * positions currently have data; more slot in the same way.
 */
export type Facing = { raise: number; call: number };

type VsData = {
  raiseCore: Partial<Record<AnySeat, string[]>>;
  callCore: Partial<Record<AnySeat, string[]>>;
  mixes: Partial<Record<AnySeat, Record<string, Facing>>>;
};

const VS_DATA: Partial<Record<Position, VsData>> = {
  UTG: {
    raiseCore: {
      HJ: ["55+", "AKs", "AKo"],
      CO: ["66+", "AKs", "AKo", "AQs"],
      BTN: ["QQ+", "AKs", "AKo"],
      SB: ["QQ+", "AKs", "AKo"],
      BB: ["QQ+", "AKs", "AKo"],
    },
    callCore: {
      BTN: ["77+", "A2s+", "KTs+", "K9s", "QTs+", "Q9s", "JTs", "T9s", "98s", "87s", "76s", "65s"],
      SB: [
        "22+", "A2s+", "K5s+", "Q7s+", "J8s+", "T8s+", "98s", "87s", "76s", "65s", "54s",
        "ATo+", "KJo+", "QJo",
      ],
      BB: [
        "22+", "A2s+", "K2s+", "Q2s+", "J4s+", "T5s+", "94s+", "84s+", "74s+", "64s+", "54s",
        "A2o+", "K5o+", "Q7o+", "J8o+", "T8o+", "97o+",
      ],
    },
    mixes: {
      HJ: {
        "A9s": { raise: 1, call: 0 }, "A8s": { raise: 1, call: 0 }, "A7s": { raise: 1, call: 0 },
        "A5s": { raise: 1, call: 0 }, "A4s": { raise: 1, call: 0 }, "A3s": { raise: 1, call: 0 },
        "JTs": { raise: 1, call: 0 }, "QJs": { raise: 1, call: 0 },
        "98s": { raise: 1, call: 0 }, "87s": { raise: 1, call: 0 }, "76s": { raise: 1, call: 0 },
        "65s": { raise: 1, call: 0 }, "54s": { raise: 1, call: 0 },
        "44": { raise: 1, call: 0 }, "33": { raise: 1, call: 0 },
      },
      CO: {
        "A9s": { raise: 2, call: 0 }, "A8s": { raise: 2, call: 0 }, "A7s": { raise: 2, call: 0 },
        "A5s": { raise: 2, call: 0 }, "A4s": { raise: 2, call: 0 }, "A3s": { raise: 2, call: 0 },
        "JTs": { raise: 2, call: 0 }, "QJs": { raise: 2, call: 0 }, "KQs": { raise: 2, call: 0 },
        "98s": { raise: 2, call: 0 }, "87s": { raise: 2, call: 0 }, "76s": { raise: 2, call: 0 },
        "65s": { raise: 2, call: 0 }, "54s": { raise: 2, call: 0 },
        "44": { raise: 0, call: 1 }, "55": { raise: 0, call: 1 },
      },
      BTN: {
        "AQs": { raise: 2, call: 4 }, "AQo": { raise: 2, call: 0 }, "AJs": { raise: 1, call: 5 },
        "55": { raise: 0, call: 5 }, "66": { raise: 0, call: 5 },
        "ATs": { raise: 0, call: 5 }, "ATo": { raise: 0, call: 3 },
        "KJs": { raise: 0, call: 5 }, "QJs": { raise: 0, call: 5 },
        "44": { raise: 0, call: 4 }, "33": { raise: 0, call: 4 }, "22": { raise: 0, call: 4 },
        "A9s": { raise: 1, call: 4 }, "A8s": { raise: 1, call: 4 }, "A7s": { raise: 1, call: 3 },
      },
      SB: {
        "AQs": { raise: 3, call: 3 }, "AQo": { raise: 2, call: 1 }, "AJs": { raise: 1, call: 5 },
        "AJo": { raise: 0, call: 4 }, "ATs": { raise: 0, call: 5 }, "ATo": { raise: 0, call: 3 },
        "KQs": { raise: 1, call: 5 }, "KQo": { raise: 0, call: 3 },
        "22": { raise: 0, call: 5 }, "33": { raise: 0, call: 5 }, "44": { raise: 0, call: 5 },
      },
      BB: {
        "AQs": { raise: 2, call: 4 }, "AQo": { raise: 1, call: 5 }, "AJs": { raise: 0, call: 6 },
        "KQs": { raise: 0, call: 6 }, "K4o": { raise: 0, call: 3 }, "K3o": { raise: 0, call: 2 },
        "Q6o": { raise: 0, call: 3 }, "J7o": { raise: 0, call: 3 }, "T7o": { raise: 0, call: 3 },
        "96o": { raise: 0, call: 3 }, "42s": { raise: 0, call: 4 }, "32s": { raise: 0, call: 4 },
      },
    },
  },
  HJ: {
    // Facing HJ's (wider, weaker) open, everyone plays a notch looser than
    // the equivalent seat would facing a UTG open.
    raiseCore: {
      CO: ["55+", "AKs", "AKo"],
      BTN: ["66+", "AKs", "AKo", "AQs"],
      SB: ["QQ+", "AKs", "AKo"],
      BB: ["QQ+", "AKs", "AKo"],
    },
    callCore: {
      BTN: [
        "77+", "A2s+", "KTs+", "K9s", "QTs+", "Q9s", "JTs", "T9s", "98s", "87s", "76s", "65s", "54s",
      ],
      SB: [
        "22+", "A2s+", "K4s+", "Q6s+", "J7s+", "T7s+", "97s+", "87s", "76s", "65s", "54s",
        "ATo+", "KTo+", "QJo",
      ],
      BB: [
        "22+", "A2s+", "K2s+", "Q2s+", "J3s+", "T4s+", "93s+", "83s+", "73s+", "63s+", "53s+",
        "A2o+", "K4o+", "Q6o+", "J7o+", "T7o+", "96o+",
      ],
    },
    mixes: {
      CO: {
        "A9s": { raise: 1, call: 0 }, "A8s": { raise: 1, call: 0 }, "A7s": { raise: 1, call: 0 },
        "A5s": { raise: 1, call: 0 }, "A4s": { raise: 1, call: 0 }, "A3s": { raise: 1, call: 0 },
        "JTs": { raise: 1, call: 0 }, "QJs": { raise: 1, call: 0 },
        "98s": { raise: 1, call: 0 }, "87s": { raise: 1, call: 0 }, "76s": { raise: 1, call: 0 },
        "65s": { raise: 1, call: 0 }, "54s": { raise: 1, call: 0 },
        "44": { raise: 1, call: 0 }, "33": { raise: 1, call: 0 },
      },
      BTN: {
        "AQs": { raise: 2, call: 4 }, "AQo": { raise: 2, call: 1 }, "AJs": { raise: 1, call: 5 },
        "55": { raise: 0, call: 5 }, "66": { raise: 0, call: 5 },
        "ATs": { raise: 0, call: 5 }, "ATo": { raise: 0, call: 4 },
        "KJs": { raise: 0, call: 5 }, "QJs": { raise: 0, call: 5 }, "KQo": { raise: 0, call: 2 },
        "44": { raise: 0, call: 4 }, "33": { raise: 0, call: 4 }, "22": { raise: 0, call: 4 },
        "A9s": { raise: 1, call: 4 }, "A8s": { raise: 1, call: 4 }, "A7s": { raise: 1, call: 4 },
      },
      SB: {
        "AQs": { raise: 3, call: 3 }, "AQo": { raise: 2, call: 2 }, "AJs": { raise: 1, call: 5 },
        "AJo": { raise: 0, call: 5 }, "ATs": { raise: 0, call: 5 }, "ATo": { raise: 0, call: 4 },
        "KQs": { raise: 1, call: 5 }, "KQo": { raise: 0, call: 4 },
        "22": { raise: 0, call: 5 }, "33": { raise: 0, call: 5 }, "44": { raise: 0, call: 5 },
      },
      BB: {
        "AQs": { raise: 2, call: 4 }, "AQo": { raise: 1, call: 5 }, "AJs": { raise: 0, call: 6 },
        "KQs": { raise: 0, call: 6 }, "K3o": { raise: 0, call: 3 }, "K2o": { raise: 0, call: 2 },
        "Q5o": { raise: 0, call: 3 }, "J6o": { raise: 0, call: 3 }, "T6o": { raise: 0, call: 3 },
        "95o": { raise: 0, call: 3 }, "42s": { raise: 0, call: 5 }, "32s": { raise: 0, call: 5 },
      },
    },
  },
};

type SeatSets = Partial<Record<AnySeat, { raise: Set<string>; call: Set<string> }>>;

const VS_SETS: Partial<Record<Position, SeatSets>> = Object.fromEntries(
  Object.entries(VS_DATA).map(([opener, data]) => [
    opener,
    Object.fromEntries(
      SEATS.map((seat) => [
        seat,
        {
          raise: expandRange(data!.raiseCore[seat] ?? []),
          call: expandRange(data!.callCore[seat] ?? []),
        },
      ])
    ),
  ])
);

/** Openers we currently have facing-ranges for. */
export const VS_OPENERS: Position[] = Object.keys(VS_DATA) as Position[];

/** Seats that can face an open from `opener` (everyone who acts after them). */
export function heroesFacing(opener: Position): AnySeat[] {
  return SEATS.slice(SEATS.indexOf(opener) + 1);
}

/** {raise, call} in sixths for `hero` facing an open from `opener`.
 *  Fold is whatever sixths remain (6 - raise - call). */
export function vsOpenSixths(hero: AnySeat, opener: Position, hand: string): Facing {
  const data = VS_DATA[opener];
  const sets = VS_SETS[opener]?.[hero];
  if (!data || !sets) return { raise: 0, call: 0 }; // no data for this opener yet

  const override = data.mixes[hero]?.[hand];
  if (override) return override;
  if (sets.raise.has(hand)) return { raise: 6, call: 0 };
  if (sets.call.has(hand)) return { raise: 0, call: 6 };
  return { raise: 0, call: 0 };
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

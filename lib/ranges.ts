/**
 * Preflop RFI (open-raise) ranges.
 *
 * These are our own simplified, hand-picked ranges — every hand is either
 * a pure RAISE or a pure FOLD (no mixed/split-frequency hands), tuned to
 * land close to standard 100bb 6-max opening frequencies. They are not a
 * copy of any solver's exact output; they're a deliberately simplified
 * approximation for training purposes.
 */

export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB";
export type Action = "Raise" | "Fold";

export const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];

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

// Raw range definitions (RAISE hands only — everything else folds).
// Approx combo % noted for reference against standard 100bb RFI charts.
const RAW_RANGES: Record<Position, string[]> = {
  // ~17.6% combos
  UTG: ["44+", "A2s+", "K7s+", "Q9s+", "J9s+", "T9s", "AJo+", "KJo+", "QJo"],
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

/** Number of combos behind a given hand code (pair=6, suited=4, offsuit=12). */
export function comboCount(hand: string): number {
  if (hand.length === 2) return 6; // pair
  return hand.endsWith("s") ? 4 : 12;
}

/** The correct RFI action for a hand at a given position. */
export function getAction(position: Position, hand: string): Action {
  return RFI_RANGES[position].has(hand) ? "Raise" : "Fold";
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

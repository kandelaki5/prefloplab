"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_HANDS, SEATS,
  comboCount, sampleOpenedHand,
  type AnySeat, type FacingAction,
} from "@/lib/ranges";
import {
  ANY_SEAT, SPOTS, botsForHero, heroesForKind, poolHeading, spotBot, spotFromSlug,
  spotIsMixed, spotLabel, spotPool, spotResolve, spotSixths, spotSlug,
  type Spot, type SpotKind,
} from "@/lib/spots";
import { PlayingCard } from "@/components/PlayingCard";
import { Table6Max } from "@/components/Table6Max";
import { Logo } from "@/components/Logo";
import { RangeGrid, RangeLegend } from "@/components/RangeGrid";
import { Dice } from "@/components/Dice";

const SUITS = ["♠", "♥", "♦", "♣"];

type Mode = "rfi" | "vs" | "vs3bet" | "random";

const MODES: { mode: Mode; label: string; blurb: string }[] = [
  { mode: "rfi", label: "PFR", blurb: "Unopened — Fold or Raise" },
  { mode: "vs", label: "vs PFR", blurb: "Someone opened — Fold, Call, or Raise" },
  { mode: "vs3bet", label: "vs 3-Bet", blurb: "You opened, got 3-bet back" },
  { mode: "random", label: "Random", blurb: "Mix of all three" },
];

const KINDS: { kind: SpotKind; label: string; blurb: string }[] = [
  { kind: "rfi", label: "Unopened pot", blurb: "Everyone folded to you — open or fold." },
  { kind: "vs", label: "Facing a raise", blurb: "Someone opened before you — 3-bet, call, or fold." },
  { kind: "vs3bet", label: "Facing a 3-bet", blurb: "Your open got raised back — 4-bet, call, or fold." },
];

/** Which seats hero is up against, per situation — the label on the picker's
 *  third row, since "opener" and "3-bettor" are different animals. */
const BOT_LABEL: Record<SpotKind, string> = {
  rfi: "",
  vs: "Who opens",
  vs3bet: "Who 3-bets you",
};

type BotChoice = AnySeat | typeof ANY_SEAT;
type Selection = { kind: SpotKind; hero: AnySeat | null; bot: BotChoice | null };

/** A drill is just a pool of spots to draw from: the four preset modes pool by
 *  kind, a picked spot pools the one (or, with "any" opponent, hero's row). */
type Drill =
  | { picked: false; mode: Mode; pool: Spot[] }
  | { picked: true; heading: string; pool: Spot[] };

function modePool(m: Mode): Spot[] {
  return m === "random" ? SPOTS : SPOTS.filter((s) => s.kind === m);
}

function pickTwo<T>(pool: T[]): [T, T] {
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  while (b === a) b = pool[Math.floor(Math.random() * pool.length)];
  return [a, b];
}

function pickOne<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Deals two concrete cards (with random suits) for a hand code like
 *  "AA", "AKs", "AKo". */
function dealCards(hand: string): string {
  if (hand.length === 2 && hand[0] === hand[1]) {
    const [s1, s2] = pickTwo(SUITS);
    return `${hand[0]}${s1} ${hand[0]}${s2}`;
  }

  const [high, low, suffix] = hand;
  if (suffix === "s") {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    return `${high}${suit} ${low}${suit}`;
  }

  const [s1, s2] = pickTwo(SUITS);
  return `${high}${s1} ${low}${s2}`;
}

/** Random hand code, weighted by real combo counts (pairs=6, suited=4,
 *  offsuit=12), so common combos come up more often — like a real deck. */
function sampleHand(): string {
  const total = ALL_HANDS.reduce((sum, h) => sum + comboCount(h), 0);
  let r = Math.random() * total;

  for (const h of ALL_HANDS) {
    r -= comboCount(h);
    if (r <= 0) return h;
  }
  return ALL_HANDS[0];
}

function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

/* =========================
   MAIN APP
========================= */
export function Trainer() {
  const linkedSlug = useSearchParams().get("spot");

  const [drill, setDrill] = useState<Drill | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [picking, setPicking] = useState(false);
  // A ?spot= link should land straight in the drill, so hold the first paint
  // back until the link has been applied rather than flashing the menu.
  const [ready, setReady] = useState(linkedSlug === null);

  const [spot, setSpot] = useState<Spot | null>(null);
  const [hand, setHand] = useState<string | null>(null);
  const [cards, setCards] = useState("");
  const [die, setDie] = useState(1);

  const [result, setResult] = useState("");
  const [exp, setExp] = useState("");

  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [last, setLast] = useState<FacingAction | null>(null);

  function deal(pool: Spot[]) {
    const s = pickOne(pool);
    const h = s.kind === "vs3bet" ? sampleOpenedHand(s.hero, s.threebettor) : sampleHand();
    setSpot(s);
    setHand(h);
    setCards(dealCards(h));
    setDie(rollDie());
    setResult("");
    setExp("");
    setLast(null);
  }

  // No auto-deal-on-mount effect needed for the menu path: the first hand is
  // dealt from a click, an ordinary event handler — not a render-phase effect —
  // so there's no server/client hydration mismatch to defer around.
  function start(d: Drill) {
    setDrill(d);
    setPicking(false);
    setScore(0);
    setTotal(0);
    setMistakes([]);
    deal(d.pool);
  }

  /** Lock the drill to one selection: a single spot, or hero's whole row when
   *  the opponent's seat is "any". */
  function startPicked(kind: SpotKind, hero: AnySeat, bot: BotChoice | null) {
    setSel({ kind, hero, bot });
    start({
      picked: true,
      heading: poolHeading(kind, hero, bot),
      pool: spotPool(kind, hero, bot),
    });
  }

  // One-shot sync from an external system — the URL — into state: a
  // /range/<slug> page links here as /?spot=<slug> to start that exact drill.
  // The first hand has to be dealt at random, which can't happen during render
  // without risking a hydration mismatch, so it happens here instead.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (linkedSlug === null) return;
    const s = spotFromSlug(linkedSlug);
    if (s) startPicked(s.kind, s.hero, spotBot(s));
    setReady(true);
  }, [linkedSlug]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  function backToMenu() {
    setDrill(null);
    setPicking(false);
    setSpot(null);
    setHand(null);
  }

  /** From a picked drill, "change spot" returns to the picker with the same
   *  selection still highlighted. */
  function backToPicker() {
    setDrill(null);
    setPicking(true);
    setSpot(null);
    setHand(null);
  }

  const acc = useMemo(() => {
    if (!total) return 0;
    return Math.round((score / total) * 100);
  }, [score, total]);

  function act(a: FacingAction) {
    if (!hand || !spot) return;

    const correct = spotResolve(spot, hand, die);
    const mixed = spotIsMixed(spot, hand);
    const label = spotLabel(spot);

    setTotal((t) => t + 1);
    setLast(a);

    const mixNote = mixed ? ` (rolled ${die})` : "";

    if (a === correct) {
      setScore((s) => s + 1);
      setResult("✔ Optimal");
      setExp(`${label} ${hand}: ${correct}${mixNote}`);
    } else {
      setResult("✘ Deviation");
      setExp(`${label} ${hand}: correct is ${correct}${mixNote}`);
      setMistakes((m) => [...m, `${label} ${hand} → played ${a}, correct ${correct}`]);
    }
  }

  function next() {
    if (drill) deal(drill.pool);
  }

  if (!ready) return <LoadingScreen />;

  /* ---------- PICKER ---------- */
  if (picking) {
    const kind = sel?.kind ?? null;
    const heroes = kind ? heroesForKind(kind) : [];
    const bots = kind && sel?.hero ? botsForHero(kind, sel.hero) : [];
    const canStart = !!kind && !!sel?.hero && (kind === "rfi" || !!sel.bot);

    const chip = (label: string, on: boolean, enabled: boolean, onClick: () => void) => (
      <button
        key={label}
        disabled={!enabled}
        onClick={onClick}
        className={`rounded-lg py-2.5 text-[11px] font-semibold transition-colors sm:text-sm ${
          on
            ? "bg-[#d3ac47] text-[#221703]"
            : enabled
              ? "bg-[#1c2831] text-[#c3d3dc] hover:bg-[#243440]"
              : "bg-[#141c23] text-gray-700"
        }`}
      >
        {label}
      </button>
    );

    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3 mb-2">
          <Logo className="w-10 h-10 sm:w-14 sm:h-14" />
          <h1 className="text-2xl sm:text-4xl font-bold">Pick a spot</h1>
        </div>
        <p className="text-gray-400 mb-8 text-sm text-center">
          Choose the situation, your seat, and the bot&apos;s seat.
        </p>

        <div className="w-full max-w-md space-y-7">
          <section>
            <h2 className="mb-2 text-xs uppercase tracking-wider text-gray-500">Situation</h2>
            <div className="grid grid-cols-1 gap-2">
              {KINDS.map(({ kind: k, label, blurb }) => (
                <button
                  key={k}
                  onClick={() => setSel({ kind: k, hero: null, bot: null })}
                  className={`flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors ${
                    kind === k
                      ? "border-[#d3ac47] bg-[#243040]"
                      : "border-white/10 bg-[#1c2831] hover:border-[#d3ac47]"
                  }`}
                >
                  <span className="font-semibold text-[#d3ac47]">{label}</span>
                  <span className="text-xs text-gray-400">{blurb}</span>
                </button>
              ))}
            </div>
          </section>

          {kind && (
            <section>
              <h2 className="mb-2 text-xs uppercase tracking-wider text-gray-500">Your seat</h2>
              <div className="grid grid-cols-6 gap-1.5">
                {SEATS.map((seat) =>
                  chip(seat, sel?.hero === seat, heroes.includes(seat), () =>
                    setSel({ kind, hero: seat, bot: null })
                  )
                )}
              </div>
            </section>
          )}

          {kind && kind !== "rfi" && sel?.hero && (
            <section>
              <h2 className="mb-2 text-xs uppercase tracking-wider text-gray-500">
                {BOT_LABEL[kind]}
              </h2>
              <div className="grid grid-cols-6 gap-1.5">
                {SEATS.map((seat) =>
                  chip(seat, sel.bot === seat, bots.includes(seat), () =>
                    setSel({ ...sel, bot: seat })
                  )
                )}
              </div>
              <button
                onClick={() => setSel({ ...sel, bot: ANY_SEAT })}
                className={`mt-1.5 w-full rounded-lg py-2.5 text-[11px] font-semibold transition-colors sm:text-sm ${
                  sel.bot === ANY_SEAT
                    ? "bg-[#d3ac47] text-[#221703]"
                    : "bg-[#1c2831] text-[#c3d3dc] hover:bg-[#243440]"
                }`}
              >
                Any seat — a different opponent every hand
              </button>
            </section>
          )}

          <button
            disabled={!canStart}
            onClick={() => {
              if (!canStart || !sel?.hero || !kind) return;
              startPicked(kind, sel.hero, sel.bot);
            }}
            className={`w-full rounded-xl py-3.5 font-semibold transition-colors ${
              canStart ? "bg-[#d3ac47] text-[#221703]" : "bg-[#1c2831] text-gray-600"
            }`}
          >
            {canStart && kind && sel?.hero
              ? `Drill ${poolHeading(kind, sel.hero, sel.bot)}`
              : "Start drilling"}
          </button>

          <button
            onClick={backToMenu}
            className="w-full text-xs text-gray-500 underline underline-offset-4 hover:text-[#d3ac47]"
          >
            Back to the menu
          </button>
        </div>
      </main>
    );
  }

  /* ---------- MENU ---------- */
  if (!drill) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3 mb-2">
          <Logo className="w-12 h-12 sm:w-16 sm:h-16" />
          <h1 className="text-3xl sm:text-5xl font-bold">Preflop Solver</h1>
        </div>
        <p className="text-gray-400 mb-10 text-sm sm:text-base">Pick what you want to drill.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
          {MODES.map(({ mode: m, label, blurb }) => (
            <button
              key={m}
              onClick={() => start({ picked: false, mode: m, pool: modePool(m) })}
              className="flex flex-col items-start gap-1 px-6 py-5 rounded-xl bg-[#1c2831] border border-white/10 text-left hover:border-[#d3ac47] hover:bg-[#243040] transition-colors"
            >
              <span className="text-xl font-bold text-[#d3ac47]">{label}</span>
              <span className="text-xs text-gray-400">{blurb}</span>
            </button>
          ))}

          <button
            onClick={() => setPicking(true)}
            className="flex flex-col items-start gap-1 px-6 py-5 rounded-xl bg-[#243040] border border-[#d3ac47]/40 text-left hover:border-[#d3ac47] transition-colors sm:col-span-2"
          >
            <span className="text-xl font-bold text-[#d3ac47]">Pick a Spot</span>
            <span className="text-xs text-gray-400">
              Choose the situation and both seats — drill just that one
            </span>
          </button>
        </div>

        <Link
          href="/range"
          className="mt-8 text-sm text-gray-500 underline underline-offset-4 hover:text-[#d3ac47]"
        >
          Or browse all 35 ranges as charts
        </Link>
      </main>
    );
  }

  /* ---------- DRILL ---------- */
  if (!hand || !spot) return <LoadingScreen />;

  const buttons: FacingAction[] = spot.kind === "rfi" ? ["Fold", "Raise"] : ["Fold", "Call", "Raise"];

  const buttonClass = (a: FacingAction) => {
    if (last === a) return "bg-[#d3ac47] text-[#221703]";
    if (a === "Raise") return "bg-[#7a2f1c] hover:bg-[#8f3a24] text-[#fbe6db]";
    if (a === "Call") return "bg-[#255c34] hover:bg-[#2e6f3f] text-[#dcf0e2]";
    return "bg-[#1c2831] hover:bg-[#243440] text-[#c3d3dc]";
  };

  const headerLabel = drill.picked
    ? `${drill.heading} — change spot`
    : `${MODES.find((m) => m.mode === drill.mode)?.label} — change mode`;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-3 pt-6 pb-28 sm:px-6 sm:pt-10 sm:pb-10">

      <div className="flex items-center gap-2.5 sm:gap-3 mb-1">
        <Logo className="w-10 h-10 sm:w-14 sm:h-14" />
        <h1 className="text-3xl sm:text-5xl font-bold">Preflop Solver</h1>
      </div>
      <div className="mb-6 flex items-center gap-3 text-xs text-gray-500">
        <button
          onClick={drill.picked ? backToPicker : backToMenu}
          className="hover:text-[#d3ac47] underline underline-offset-2"
        >
          {headerLabel}
        </button>
        <Link href="/range" className="hover:text-[#d3ac47] underline underline-offset-2">
          all ranges
        </Link>
      </div>

      {/* TABLE — the die sits on the felt, where a real one would be. */}
      <div className="flex w-full items-center justify-center mb-6 sm:mb-4">
        <Table6Max hero={spot.hero} opener={spotBot(spot) ?? undefined}>
          <Dice value={die} className="w-11 h-11 sm:w-14 sm:h-14" />
        </Table6Max>
      </div>

      {/* CONTEXT */}
      <div className="text-sm text-gray-400 mb-4 tracking-wide text-center px-2">
        {spot.kind === "vs" && (
          <>
            <span className="text-[#b6472b] font-semibold">{spot.opener}</span> raises. You are in{" "}
            <span className="text-[#d3ac47] font-semibold">{spot.hero}</span>.
          </>
        )}
        {spot.kind === "vs3bet" && (
          <>
            You open <span className="text-[#d3ac47] font-semibold">{spot.hero}</span>,{" "}
            <span className="text-[#b6472b] font-semibold">{spot.threebettor}</span> 3-bets.
          </>
        )}
        {spot.kind === "rfi" && (
          <>
            You are in <span className="text-[#d3ac47] font-semibold">{spot.hero}</span>, unopened.
          </>
        )}
      </div>

      {/* CARDS */}
      <div className="flex gap-3 mb-5 sm:mb-6">
        {cards.split(" ").map((c, i) => (
          <PlayingCard key={i} card={c} />
        ))}
      </div>

      {/* ACTIONS — pinned above the fold on phones so you can answer without
          scrolling past the table; a plain inline row from `sm` up. Once you
          have answered there is nothing left to press but Next, so the bar
          swaps to it rather than crowding four buttons onto one line. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-black/90 px-3 py-3 backdrop-blur sm:static sm:mb-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex w-full max-w-md gap-2 sm:max-w-none sm:justify-center sm:gap-4">
          {last && (
            <button
              onClick={next}
              className="flex-1 rounded-xl bg-white py-3 font-semibold text-black sm:hidden"
            >
              Next Hand
            </button>
          )}
          {buttons.map((a) => (
            <button
              key={a}
              onClick={() => act(a)}
              className={`flex-1 rounded-xl py-3 font-semibold transition-colors sm:flex-none sm:px-6 ${last ? "hidden sm:block" : ""} ${buttonClass(a)}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* FEEDBACK */}
      {result && <div className="text-lg mb-1">{result}</div>}
      {exp && <div className="text-gray-400 text-sm mb-6">{exp}</div>}

      <button onClick={next} className="hidden sm:block bg-white text-black px-6 py-3 rounded-xl mb-8 font-semibold">
        Next Hand
      </button>

      {/* RANGE GRID — hidden until you act, so it can't be used as an answer key */}
      <div className="mb-10 w-full max-w-[420px]">
        <div className="flex items-center justify-center gap-x-4 gap-y-1 mb-2 flex-wrap">
          <div className="text-xs text-gray-400">
            {spot.kind === "rfi" ? `${spot.hero} Opening Range` : poolHeading(spot.kind, spot.hero, spotBot(spot))}
          </div>
          <RangeLegend call={spot.kind !== "rfi"} na={spot.kind === "vs3bet"} />
        </div>

        {last ? (
          <>
            <RangeGrid sixths={(h) => spotSixths(spot, h)} />
            <Link
              href={`/range/${spotSlug(spot)}`}
              className="mt-2 block text-center text-[11px] text-gray-500 underline underline-offset-4 hover:text-[#d3ac47]"
            >
              Full chart and hand list
            </Link>
          </>
        ) : (
          <div className="w-full h-[130px] flex items-center justify-center rounded-lg border border-dashed border-zinc-700 text-xs text-gray-500">
            Act to reveal
          </div>
        )}
      </div>

      {/* STATS */}
      <div className="text-sm text-gray-400 text-center">
        <div>Hands: {total}</div>
        <div>Accuracy: {acc}%</div>
      </div>

      {/* MISTAKES */}
      {mistakes.length > 0 && (
        <div className="mt-10 text-xs text-gray-500 w-full max-w-md px-2">
          <div className="text-white mb-2">Mistakes</div>
          {mistakes.slice(-6).map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
    </main>
  );
}

export function LoadingScreen() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <Logo className="w-12 h-12 opacity-40" />
    </main>
  );
}

"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  ALL_HANDS, HAND_GRID, POSITIONS, VS_OPENERS, VS3BET_OPENERS,
  comboCount, isMixed, raiseSixths, resolveAction,
  isVsOpenMixed, vsOpenSixths, resolveVsOpenAction, heroesFacing,
  isVs3betMixed, vs3betSixths, resolveVs3betAction, threebettorsFor, sampleOpenedHand,
  type AnySeat, type FacingAction, type Position,
} from "@/lib/ranges";
import { PlayingCard } from "@/components/PlayingCard";
import { Table6Max } from "@/components/Table6Max";
import { Dice } from "@/components/Dice";

const SUITS = ["♠", "♥", "♦", "♣"];

type Scenario =
  | { kind: "rfi"; hero: Position }
  | { kind: "vs"; hero: AnySeat; opener: Position }
  | { kind: "vs3bet"; hero: Position; threebettor: AnySeat };

type Mode = "rfi" | "vs" | "vs3bet" | "random";

const MODES: { mode: Mode; label: string; blurb: string }[] = [
  { mode: "rfi", label: "PFR", blurb: "Unopened — Fold or Raise" },
  { mode: "vs", label: "vs PFR", blurb: "Someone opened — Fold, Call, or Raise" },
  { mode: "vs3bet", label: "vs 3-Bet", blurb: "You opened, got 3-bet back" },
  { mode: "random", label: "Random", blurb: "Mix of all three" },
];

function pickTwo<T>(pool: T[]): [T, T] {
  const a = pool[Math.floor(Math.random() * pool.length)];
  let b = pool[Math.floor(Math.random() * pool.length)];
  while (b === a) b = pool[Math.floor(Math.random() * pool.length)];
  return [a, b];
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

function randomScenario(mode: Mode): Scenario {
  const kind = mode === "random" ? (["rfi", "vs", "vs3bet"] as const)[Math.floor(Math.random() * 3)] : mode;

  if (kind === "vs3bet") {
    const hero = VS3BET_OPENERS[Math.floor(Math.random() * VS3BET_OPENERS.length)];
    const threebettors = threebettorsFor(hero);
    const threebettor = threebettors[Math.floor(Math.random() * threebettors.length)];
    return { kind: "vs3bet", hero, threebettor };
  }

  if (kind === "vs") {
    const opener = VS_OPENERS[Math.floor(Math.random() * VS_OPENERS.length)];
    const heroes = heroesFacing(opener);
    const hero = heroes[Math.floor(Math.random() * heroes.length)];
    return { kind: "vs", hero, opener };
  }

  const hero = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
  return { kind: "rfi", hero };
}

const RAISE_COLOR = "#b6472b";
const CALL_COLOR = "#3f8a4c";
const FOLD_COLOR = "#2a3742";
const NA_COLOR = "#2b2b2b";

/** Grid cell fill: a solid color for pure hands, a proportional 3-way
 *  split for mixed ones (raise | call | fold, left to right). */
function cellStyle(raise: number, call: number): CSSProperties {
  const raisePct = (raise / 6) * 100;
  const callEndPct = ((raise + call) / 6) * 100;
  return {
    backgroundImage: `linear-gradient(to right, ${RAISE_COLOR} ${raisePct}%, ${CALL_COLOR} ${raisePct}%, ${CALL_COLOR} ${callEndPct}%, ${FOLD_COLOR} ${callEndPct}%)`,
  };
}

/* =========================
   MAIN APP
========================= */
export default function TrainerPage() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [hand, setHand] = useState<string | null>(null);
  const [cards, setCards] = useState("");
  const [die, setDie] = useState(1);

  const [result, setResult] = useState("");
  const [exp, setExp] = useState("");

  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [last, setLast] = useState<FacingAction | null>(null);

  function deal(m: Mode) {
    const s = randomScenario(m);
    const h = s.kind === "vs3bet" ? sampleOpenedHand(s.hero, s.threebettor) : sampleHand();
    setScenario(s);
    setHand(h);
    setCards(dealCards(h));
    setDie(rollDie());
    setResult("");
    setExp("");
    setLast(null);
  }

  // No auto-deal-on-mount effect needed: the first hand is dealt from the
  // mode-select click below, an ordinary event handler — not a render-phase
  // effect — so there's no server/client hydration mismatch to defer around.
  function selectMode(m: Mode) {
    setMode(m);
    setScore(0);
    setTotal(0);
    setMistakes([]);
    deal(m);
  }

  function backToMenu() {
    setMode(null);
    setScenario(null);
    setHand(null);
  }

  const acc = useMemo(() => {
    if (!total) return 0;
    return Math.round((score / total) * 100);
  }, [score, total]);

  function sixthsFor(h: string): { raise: number; call: number } | null {
    if (!scenario) return { raise: 0, call: 0 };
    if (scenario.kind === "rfi") return { raise: raiseSixths(scenario.hero, h), call: 0 };
    if (scenario.kind === "vs") return vsOpenSixths(scenario.hero, scenario.opener, h);
    return vs3betSixths(scenario.hero, scenario.threebettor, h);
  }

  function act(a: FacingAction) {
    if (!hand || !scenario) return;

    let correct: FacingAction;
    let mixed: boolean;
    let label: string;

    if (scenario.kind === "rfi") {
      correct = resolveAction(scenario.hero, hand, die);
      mixed = isMixed(scenario.hero, hand);
      label = scenario.hero;
    } else if (scenario.kind === "vs") {
      correct = resolveVsOpenAction(scenario.hero, scenario.opener, hand, die);
      mixed = isVsOpenMixed(scenario.hero, scenario.opener, hand);
      label = `${scenario.opener} raise → ${scenario.hero}`;
    } else {
      correct = resolveVs3betAction(scenario.hero, scenario.threebettor, hand, die);
      mixed = isVs3betMixed(scenario.hero, scenario.threebettor, hand);
      label = `${scenario.hero} opens, ${scenario.threebettor} 3-bets`;
    }

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
    if (mode) deal(mode);
  }

  if (!mode) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-10 sm:px-6">
        <h1 className="text-3xl sm:text-5xl font-bold mb-2">Preflop Solver</h1>
        <p className="text-gray-400 mb-10 text-sm sm:text-base">Pick what you want to drill.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
          {MODES.map(({ mode: m, label, blurb }) => (
            <button
              key={m}
              onClick={() => selectMode(m)}
              className="flex flex-col items-start gap-1 px-6 py-5 rounded-xl bg-[#1c2831] border border-white/10 text-left hover:border-[#d3ac47] hover:bg-[#243040] transition-colors"
            >
              <span className="text-xl font-bold text-[#d3ac47]">{label}</span>
              <span className="text-xs text-gray-400">{blurb}</span>
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (!hand || !scenario) return <div className="text-white">Loading...</div>;

  const buttons: FacingAction[] = scenario.kind === "rfi" ? ["Fold", "Raise"] : ["Fold", "Call", "Raise"];

  const buttonClass = (a: FacingAction) => {
    if (last === a) return "bg-[#d3ac47] text-[#221703]";
    if (a === "Raise") return "bg-[#7a2f1c] hover:bg-[#8f3a24] text-[#fbe6db]";
    if (a === "Call") return "bg-[#255c34] hover:bg-[#2e6f3f] text-[#dcf0e2]";
    return "bg-[#1c2831] hover:bg-[#243440] text-[#c3d3dc]";
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-3 pt-6 pb-28 sm:px-6 sm:pt-10 sm:pb-10">

      <h1 className="text-3xl sm:text-5xl font-bold mb-1">Preflop Solver</h1>
      <button onClick={backToMenu} className="text-xs text-gray-500 hover:text-[#d3ac47] mb-6 underline underline-offset-2">
        {MODES.find((m) => m.mode === mode)?.label} — change mode
      </button>

      {/* TABLE + DIE — side by side when there is room, die on the felt when
          there isn't (a phone has no width to spare next to the table). */}
      <div className="flex w-full items-center justify-center gap-8 mb-6 sm:mb-2">
        <Table6Max
          hero={scenario.hero}
          opener={scenario.kind === "vs" ? scenario.opener : scenario.kind === "vs3bet" ? scenario.threebettor : undefined}
        >
          <Dice value={die} className="w-11 h-11 sm:hidden" />
        </Table6Max>
        <Dice value={die} className="hidden sm:block sm:w-16 sm:h-16" />
      </div>

      {/* CONTEXT */}
      <div className="text-sm text-gray-400 mb-4 tracking-wide text-center px-2">
        {scenario.kind === "vs" && (
          <>
            <span className="text-[#b6472b] font-semibold">{scenario.opener}</span> raises. You are in{" "}
            <span className="text-[#d3ac47] font-semibold">{scenario.hero}</span>.
          </>
        )}
        {scenario.kind === "vs3bet" && (
          <>
            You open <span className="text-[#d3ac47] font-semibold">{scenario.hero}</span>,{" "}
            <span className="text-[#b6472b] font-semibold">{scenario.threebettor}</span> 3-bets.
          </>
        )}
        {scenario.kind === "rfi" && (
          <>
            You are in <span className="text-[#d3ac47] font-semibold">{scenario.hero}</span>, unopened.
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
            {scenario.kind === "vs" && `${scenario.hero} vs ${scenario.opener} raise`}
            {scenario.kind === "vs3bet" && `${scenario.hero} vs ${scenario.threebettor} 3-bet`}
            {scenario.kind === "rfi" && `${scenario.hero} Opening Range`}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RAISE_COLOR }} />
              Raise
            </span>
            {scenario.kind !== "rfi" && (
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CALL_COLOR }} />
                Call
              </span>
            )}
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: FOLD_COLOR }} />
              Fold
            </span>
            {scenario.kind === "vs3bet" && (
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: NA_COLOR }} />
                Never opened
              </span>
            )}
          </div>
        </div>

        {last ? (
          <div className="grid grid-cols-13 gap-px sm:gap-[2px] w-full">
            {HAND_GRID.flat().map((h) => {
              const sixths = sixthsFor(h);
              if (!sixths) {
                return (
                  <div
                    key={h}
                    className="aspect-square rounded-[2px] sm:rounded flex items-center justify-center text-[7px] sm:text-[9px] leading-none text-zinc-600 font-medium"
                    style={{ background: NA_COLOR }}
                  >
                    {h}
                  </div>
                );
              }
              return (
                <div
                  key={h}
                  className="aspect-square rounded-[2px] sm:rounded flex items-center justify-center text-[7px] sm:text-[9px] leading-none text-[#f5ede0] font-medium"
                  style={cellStyle(sixths.raise, sixths.call)}
                >
                  {h}
                </div>
              );
            })}
          </div>
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

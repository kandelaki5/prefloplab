"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ALL_HANDS, HAND_GRID, POSITIONS, VS_OPENERS,
  comboCount, isMixed, raiseSixths, resolveAction,
  isVsOpenMixed, vsOpenSixths, resolveVsOpenAction, heroesFacing,
  type AnySeat, type FacingAction, type Position,
} from "@/lib/ranges";
import { PlayingCard } from "@/components/PlayingCard";
import { Table6Max } from "@/components/Table6Max";
import { Dice } from "@/components/Dice";

const SUITS = ["♠", "♥", "♦", "♣"];

type Scenario =
  | { kind: "rfi"; hero: Position }
  | { kind: "vs"; hero: AnySeat; opener: Position };

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

function randomScenario(): Scenario {
  if (Math.random() < 0.5) {
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

  function deal() {
    const s = randomScenario();
    const h = sampleHand();
    setScenario(s);
    setHand(h);
    setCards(dealCards(h));
    setDie(rollDie());
    setResult("");
    setExp("");
    setLast(null);
  }

  useEffect(() => {
    // Deferred (not a direct synchronous setState-in-effect): the first
    // deal must happen client-side only, after hydration, so the server
    // and the client don't disagree on which random hand was dealt.
    const id = setTimeout(deal, 0);
    return () => clearTimeout(id);
  }, []);

  const acc = useMemo(() => {
    if (!total) return 0;
    return Math.round((score / total) * 100);
  }, [score, total]);

  function sixthsFor(h: string): { raise: number; call: number } {
    if (!scenario) return { raise: 0, call: 0 };
    if (scenario.kind === "rfi") return { raise: raiseSixths(scenario.hero, h), call: 0 };
    return vsOpenSixths(scenario.hero, scenario.opener, h);
  }

  function act(a: FacingAction) {
    if (!hand || !scenario) return;

    const correct: FacingAction =
      scenario.kind === "rfi" ? resolveAction(scenario.hero, hand, die) : resolveVsOpenAction(scenario.hero, scenario.opener, hand, die);
    const mixed = scenario.kind === "rfi" ? isMixed(scenario.hero, hand) : isVsOpenMixed(scenario.hero, scenario.opener, hand);

    setTotal((t) => t + 1);
    setLast(a);

    const label = scenario.kind === "rfi" ? scenario.hero : `${scenario.opener} raise → ${scenario.hero}`;
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
    deal();
  }

  if (!hand || !scenario) return <div className="text-white">Loading...</div>;

  const buttons: FacingAction[] = scenario.kind === "vs" ? ["Fold", "Call", "Raise"] : ["Fold", "Raise"];

  const buttonClass = (a: FacingAction) => {
    if (last === a) return "bg-[#d3ac47] text-[#221703]";
    if (a === "Raise") return "bg-[#7a2f1c] hover:bg-[#8f3a24] text-[#fbe6db]";
    if (a === "Call") return "bg-[#255c34] hover:bg-[#2e6f3f] text-[#dcf0e2]";
    return "bg-[#1c2831] hover:bg-[#243440] text-[#c3d3dc]";
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-10">

      <h1 className="text-5xl font-bold mb-6">Preflop Solver</h1>

      {/* TABLE + DICE */}
      <div className="flex items-center gap-8 mb-2">
        <Table6Max hero={scenario.hero} opener={scenario.kind === "vs" ? scenario.opener : undefined} />
        <Dice value={die} />
      </div>

      {/* CONTEXT */}
      <div className="text-sm text-gray-400 mb-4 tracking-wide text-center">
        {scenario.kind === "vs" ? (
          <>
            <span className="text-[#b6472b] font-semibold">{scenario.opener}</span> raises. You are in{" "}
            <span className="text-[#d3ac47] font-semibold">{scenario.hero}</span>.
          </>
        ) : (
          <>
            You are in <span className="text-[#d3ac47] font-semibold">{scenario.hero}</span>, unopened.
          </>
        )}
      </div>

      {/* CARDS */}
      <div className="flex gap-3 mb-6">
        {cards.split(" ").map((c, i) => (
          <PlayingCard key={i} card={c} />
        ))}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-4 mb-6">
        {buttons.map((a) => (
          <button
            key={a}
            onClick={() => act(a)}
            className={`px-6 py-3 rounded-xl font-semibold transition-colors ${buttonClass(a)}`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* FEEDBACK */}
      {result && <div className="text-lg mb-1">{result}</div>}
      {exp && <div className="text-gray-400 text-sm mb-6">{exp}</div>}

      <button onClick={next} className="bg-white text-black px-6 py-3 rounded-xl mb-8 font-semibold">
        Next Hand
      </button>

      {/* RANGE GRID — hidden until you act, so it can't be used as an answer key */}
      <div className="mb-10">
        <div className="flex items-center justify-center gap-4 mb-2 flex-wrap">
          <div className="text-xs text-gray-400">
            {scenario.kind === "vs" ? `${scenario.hero} vs ${scenario.opener} raise` : `${scenario.hero} Opening Range`}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RAISE_COLOR }} />
              Raise
            </span>
            {scenario.kind === "vs" && (
              <span className="flex items-center gap-1">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CALL_COLOR }} />
                Call
              </span>
            )}
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: FOLD_COLOR }} />
              Fold
            </span>
          </div>
        </div>

        {last ? (
          <div className="grid grid-cols-13 gap-[2px] max-w-[420px]">
            {HAND_GRID.flat().map((h) => {
              const { raise, call } = sixthsFor(h);
              return (
                <div
                  key={h}
                  className="text-[9px] px-1 py-1 rounded text-center text-[#f5ede0] font-medium"
                  style={cellStyle(raise, call)}
                >
                  {h}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-[420px] h-[130px] flex items-center justify-center rounded-lg border border-dashed border-zinc-700 text-xs text-gray-500">
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
        <div className="mt-10 text-xs text-gray-500 max-w-md">
          <div className="text-white mb-2">Mistakes</div>
          {mistakes.slice(-6).map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
    </main>
  );
}

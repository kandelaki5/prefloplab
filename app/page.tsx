"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ALL_HANDS, HAND_GRID, POSITIONS, comboCount, isMixed, raiseSixths, resolveAction, type Action, type Position } from "@/lib/ranges";
import { PlayingCard } from "@/components/PlayingCard";
import { Table6Max } from "@/components/Table6Max";
import { Dice } from "@/components/Dice";

const SUITS = ["♠", "♥", "♦", "♣"];

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

const RAISE_COLOR = "#b6472b";
const FOLD_COLOR = "#2a3742";

/** Grid cell fill: a solid color for pure hands, a proportional split for
 *  mixed ones (N/6 raise = N/6 of the cell in the raise color). */
function cellStyle(sixths: number): CSSProperties {
  const pct = (sixths / 6) * 100;
  return { backgroundImage: `linear-gradient(to right, ${RAISE_COLOR} ${pct}%, ${FOLD_COLOR} ${pct}%)` };
}

/* =========================
   MAIN APP
========================= */
export default function TrainerPage() {
  const [pos, setPos] = useState<Position>("UTG");
  const [hand, setHand] = useState<string | null>(null);
  const [cards, setCards] = useState("");
  const [die, setDie] = useState(1);

  const [result, setResult] = useState("");
  const [exp, setExp] = useState("");

  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [last, setLast] = useState<Action | null>(null);

  function deal() {
    const p = POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
    const h = sampleHand();
    setPos(p);
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

  function act(a: Action) {
    if (!hand) return;

    const mixed = isMixed(pos, hand);
    const correct = resolveAction(pos, hand, die);
    setTotal((t) => t + 1);
    setLast(a);

    const sixths = raiseSixths(pos, hand);
    const mixNote = mixed ? ` (${sixths}/6 raise, rolled ${die})` : "";

    if (a === correct) {
      setScore((s) => s + 1);
      setResult("✔ Optimal");
      setExp(`${pos} ${hand}: ${correct}${mixNote}`);
    } else {
      setResult("✘ Deviation");
      setExp(`${pos} ${hand}: correct is ${correct}${mixNote}`);
      setMistakes((m) => [...m, `${pos} ${hand} → played ${a}, correct ${correct}`]);
    }
  }

  function next() {
    deal();
  }

  if (!hand) return <div className="text-white">Loading...</div>;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-10">

      <h1 className="text-5xl font-bold mb-6">Preflop Solver</h1>

      {/* TABLE + DICE */}
      <div className="flex items-center gap-8 mb-2">
        <Table6Max hero={pos} />
        <Dice value={die} />
      </div>

      {/* POSITION (dealt randomly each hand) */}
      <div className="text-sm text-gray-400 mb-4 tracking-wide">
        You are in <span className="text-[#d3ac47] font-semibold">{pos}</span>
      </div>

      {/* CARDS */}
      <div className="flex gap-3 mb-6">
        {cards.split(" ").map((c, i) => (
          <PlayingCard key={i} card={c} />
        ))}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-4 mb-6">
        {(["Fold", "Raise"] as Action[]).map((a) => (
          <button
            key={a}
            onClick={() => act(a)}
            className={`px-6 py-3 rounded-xl font-semibold transition-colors ${
              last === a
                ? "bg-[#d3ac47] text-[#221703]"
                : a === "Raise"
                  ? "bg-[#7a2f1c] hover:bg-[#8f3a24] text-[#fbe6db]"
                  : "bg-[#1c2831] hover:bg-[#243440] text-[#c3d3dc]"
            }`}
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
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="text-xs text-gray-400">{pos} Opening Range</div>
          <div className="flex items-center gap-3 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: RAISE_COLOR }} />
              Raise
            </span>
            <span className="flex items-center gap-1">
              <i
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundImage: `linear-gradient(to right, ${RAISE_COLOR} 50%, ${FOLD_COLOR} 50%)` }}
              />
              Mixed
            </span>
            <span className="flex items-center gap-1">
              <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: FOLD_COLOR }} />
              Fold
            </span>
          </div>
        </div>

        {last ? (
          <div className="grid grid-cols-13 gap-[2px] max-w-[420px]">
            {HAND_GRID.flat().map((h) => (
              <div
                key={h}
                className="text-[9px] px-1 py-1 rounded text-center text-[#f5ede0] font-medium"
                style={cellStyle(raiseSixths(pos, h))}
              >
                {h}
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-[420px] h-[130px] flex items-center justify-center rounded-lg border border-dashed border-zinc-700 text-xs text-gray-500">
            Fold or Raise to reveal
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

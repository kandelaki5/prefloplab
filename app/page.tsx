"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_HANDS, HAND_GRID, POSITIONS, comboCount, getAction, type Action, type Position } from "@/lib/ranges";
import { PlayingCard } from "@/components/PlayingCard";
import { Table6Max } from "@/components/Table6Max";

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

function color(a: Action) {
  return a === "Raise" ? "bg-green-500 text-black" : "bg-zinc-800 text-white opacity-60";
}

/* =========================
   MAIN APP
========================= */
export default function TrainerPage() {
  const [pos, setPos] = useState<Position>("UTG");
  const [hand, setHand] = useState<string | null>(null);
  const [cards, setCards] = useState("");

  const [result, setResult] = useState("");
  const [exp, setExp] = useState("");

  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [last, setLast] = useState<Action | null>(null);

  function deal() {
    const h = sampleHand();
    setHand(h);
    setCards(dealCards(h));
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

    const correct = getAction(pos, hand);
    setTotal((t) => t + 1);
    setLast(a);

    if (a === correct) {
      setScore((s) => s + 1);
      setResult("✔ Optimal");
      setExp(`${pos} ${hand}: ${correct}`);
    } else {
      setResult("✘ Deviation");
      setExp(`${pos} ${hand}: correct is ${correct}`);
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

      {/* TABLE */}
      <Table6Max hero={pos} />

      {/* POSITIONS */}
      <div className="flex gap-3 mb-8">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => {
              setPos(p);
              deal();
            }}
            className={`px-5 py-2 rounded-xl ${
              pos === p ? "bg-white text-black" : "bg-zinc-800"
            }`}
          >
            {p}
          </button>
        ))}
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
            className={`px-6 py-3 rounded-xl ${
              last === a ? "bg-yellow-400 text-black" : "bg-zinc-800"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* FEEDBACK */}
      {result && <div className="text-lg mb-1">{result}</div>}
      {exp && <div className="text-gray-400 text-sm mb-6">{exp}</div>}

      <button onClick={next} className="bg-white text-black px-6 py-3 rounded-xl mb-8">
        Next Hand
      </button>

      {/* RANGE GRID */}
      <div className="mb-10">
        <div className="text-xs text-gray-400 mb-2 text-center">
          {pos} Opening Range
        </div>

        <div className="grid grid-cols-13 gap-[2px] max-w-[420px]">
          {HAND_GRID.flat().map((h) => (
            <div key={h} className={`text-[9px] px-1 py-1 rounded text-center ${color(getAction(pos, h))}`}>
              {h}
            </div>
          ))}
        </div>
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

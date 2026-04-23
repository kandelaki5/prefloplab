"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================
   CARD IMAGES
========================= */
function cardToImg(card: string) {
  const clean = card.replace(" ", "");

  const rankMap: Record<string, string> = {
    A: "A",
    K: "K",
    Q: "Q",
    J: "J",
    T: "0",
  };

  const suitMap: Record<string, string> = {
    "♠": "S",
    "♥": "H",
    "♦": "D",
    "♣": "C",
  };

  return `https://deckofcardsapi.com/static/img/${rankMap[clean[0]]}${suitMap[clean[1]]}.png`;
}

/* =========================
   6-MAX TABLE
========================= */
function Table6Max({ hero }: { hero: string }) {
  const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

  return (
    <div className="relative w-[420px] h-[260px] bg-green-900 rounded-full border-4 border-green-700 flex items-center justify-center mb-10 shadow-2xl">
      {seats.map((seat, i) => (
        <div
          key={seat}
          className={`absolute text-xs px-2 py-1 rounded-full ${
            seat === hero
              ? "bg-yellow-400 text-black font-bold"
              : "bg-black/60 text-white"
          }`}
          style={{
            transform: `rotate(${i * 60}deg) translate(120px) rotate(-${i * 60}deg)`,
          }}
        >
          {seat}
        </div>
      ))}

      <div className="text-white text-sm opacity-50">Poker Table</div>
    </div>
  );
}

/* =========================
   RANGE GRID (simplified GTO view)
========================= */
const GRID = [
  "AA","KK","QQ","JJ","TT","99","88","77","66","55","44","33","22",
  "AKs","AQs","AJs","ATs","A9s","A8s","A7s","A6s","A5s","A4s","A3s","A2s",
  "KQs","KJs","KTs","K9s","K8s","K7s","K6s","K5s","K4s","K3s","K2s",
  "QJs","QTs","Q9s","Q8s","Q7s","Q6s","Q5s","Q4s","Q3s","Q2s",
  "JTs","J9s","J8s","J7s","J6s","J5s","J4s","J3s","J2s",
  "T9s","T8s","T7s","T6s","T5s","T4s","T3s","T2s",
  "98s","97s","96s","95s","94s","93s","92s",
  "87s","86s","85s","84s","83s","82s",
  "76s","75s","74s","73s","72s",
  "65s","64s","63s","62s",
  "54s","53s","52s",
  "43s","42s",
  "32s"
];

function strategy(hand: string) {
  const raise = ["AA","KK","QQ","JJ","TT","AKs","AKo","AQs"];
  const mix = ["AJs","KQs","QJs","JTs","T9s","98s","AJo","KQo"];
  const fold = ["72s","83o","94o","T4o"];

  if (raise.includes(hand)) return "RAISE";
  if (mix.includes(hand)) return "MIX";
  if (fold.includes(hand)) return "FOLD";

  return "FOLD";
}

function color(s: string) {
  switch (s) {
    case "RAISE": return "bg-green-500 text-black";
    case "MIX": return "bg-yellow-400 text-black";
    default: return "bg-zinc-800 text-white opacity-60";
  }
}

/* =========================
   SOLVER CORE
========================= */
type Action = "Fold" | "Call" | "Raise";

type Node = {
  hand: string;
  weight: number;
  ev: Record<Action, number>;
  mix: Record<Action, number>;
};

type Position = "UTG" | "BTN";

const RANGES: Record<Position, Node[]> = {
  BTN: [
    { hand: "A♠ A♥", weight: 10, ev: { Fold: -5, Call: 5, Raise: 10 }, mix: { Fold: 0, Call: 0, Raise: 100 } },
    { hand: "K♠ K♦", weight: 9, ev: { Fold: -5, Call: 4, Raise: 9 }, mix: { Fold: 0, Call: 0, Raise: 100 } },
    { hand: "A♠ J♦", weight: 6, ev: { Fold: -1, Call: 2, Raise: 4 }, mix: { Fold: 10, Call: 20, Raise: 70 } },
    { hand: "K♣ Q♦", weight: 5, ev: { Fold: 0, Call: 2, Raise: 3 }, mix: { Fold: 20, Call: 20, Raise: 60 } },
    { hand: "7♠ 6♠", weight: 3, ev: { Fold: 1, Call: 3, Raise: 1 }, mix: { Fold: 30, Call: 30, Raise: 40 } },
  ],
  UTG: [
    { hand: "A♠ A♦", weight: 10, ev: { Fold: -5, Call: 5, Raise: 10 }, mix: { Fold: 0, Call: 0, Raise: 100 } },
    { hand: "K♠ K♣", weight: 9, ev: { Fold: -5, Call: 4, Raise: 9 }, mix: { Fold: 0, Call: 0, Raise: 100 } },
    { hand: "A♠ K♠", weight: 8, ev: { Fold: -3, Call: 3, Raise: 7 }, mix: { Fold: 0, Call: 10, Raise: 90 } },
    { hand: "A♥ J♦", weight: 2, ev: { Fold: 2, Call: 1, Raise: -1 }, mix: { Fold: 80, Call: 10, Raise: 10 } },
  ],
};

function sampleNode(pos: Position): Node {
  const range = RANGES[pos];
  const total = range.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;

  for (const n of range) {
    r -= n.weight;
    if (r <= 0) return n;
  }

  return range[0];
}

function evaluate(node: Node, action: Action) {
  const best = (Object.entries(node.ev) as [Action, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const loss = node.ev[best] - node.ev[action];

  return { best, loss };
}

/* =========================
   MAIN APP
========================= */
export default function TrainerPage() {
  const [pos, setPos] = useState<Position>("BTN");
  const [node, setNode] = useState<Node | null>(null);

  const [result, setResult] = useState("");
  const [exp, setExp] = useState("");

  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);
  const [last, setLast] = useState<Action | null>(null);

  useEffect(() => {
    setNode(sampleNode("BTN"));
  }, []);

  const acc = useMemo(() => {
    if (!total) return 0;
    return Math.round((score / total) * 100);
  }, [score, total]);

  function act(a: Action) {
    if (!node) return;

    const { best, loss } = evaluate(node, a);

    setTotal((t) => t + 1);
    setLast(a);

    if (a === best) {
      setScore((s) => s + 1);
      setResult("✔ Optimal");
      setExp("Solver approved line");
    } else {
      setResult("✘ Deviation");
      setExp(`Prefer ${best} (EV loss ${loss.toFixed(1)})`);
      setMistakes((m) => [...m, `${node.hand} → ${a}`]);
    }
  }

  function next() {
    setNode(sampleNode(pos));
    setResult("");
    setExp("");
    setLast(null);
  }

  if (!node) return <div className="text-white">Loading...</div>;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center px-6 py-10">

      <h1 className="text-5xl font-bold mb-6">Preflop Solver</h1>

      {/* TABLE */}
      <Table6Max hero={pos} />

      {/* POSITIONS */}
      <div className="flex gap-3 mb-8">
        {(["UTG","BTN"] as Position[]).map(p => (
          <button
            key={p}
            onClick={() => { setPos(p); setNode(sampleNode(p)); }}
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
        {node.hand.split(" ").map((c, i) => (
          <img key={i} src={cardToImg(c)} className="w-20 h-28 rounded-lg shadow-lg" />
        ))}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-4 mb-6">
        {(["Fold","Call","Raise"] as Action[]).map(a => (
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
          Range Grid
        </div>

        <div className="grid grid-cols-13 gap-[2px] max-w-[420px]">
          {GRID.slice(0, 169).map(h => (
            <div key={h} className={`text-[9px] px-1 py-1 rounded text-center ${color(strategy(h))}`}>
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
          {mistakes.slice(-6).map((m,i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
    </main>
  );
}


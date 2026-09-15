import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SPOTS, spotBlurb, spotHeading, spotSlug, type Spot } from "@/lib/spots";

export const metadata: Metadata = {
  title: "6-Max Preflop Ranges — Opening, Defending, 3-Bets",
  description:
    "Every 6-max preflop range in one place: opening ranges for all five positions, defending against a raise, and responding to a 3-bet. 35 charts at 100bb.",
  alternates: { canonical: "/range" },
  openGraph: {
    title: "6-Max Preflop Ranges — Opening, Defending, 3-Bets",
    description: "35 preflop charts: opening, facing a raise, and facing a 3-bet.",
    url: "/range",
  },
};

const SECTIONS: { kind: Spot["kind"]; title: string; blurb: string }[] = [
  {
    kind: "rfi",
    title: "Opening ranges",
    blurb: "Everyone folded to you. Which hands are worth a raise from each seat.",
  },
  {
    kind: "vs",
    title: "Facing a raise",
    blurb: "Someone opened before you. Which hands 3-bet, which call, and which fold.",
  },
  {
    kind: "vs3bet",
    title: "Facing a 3-bet",
    blurb: "You opened and got raised back. Which hands 4-bet, which call, and which fold.",
  },
];

export default function RangeIndex() {
  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[860px]">
        <Link href="/" className="mb-8 flex items-center gap-2 text-xs text-gray-500 hover:text-[#d3ac47]">
          <Logo className="w-6 h-6" />
          PrefLopLab
        </Link>

        <h1 className="text-2xl sm:text-4xl font-bold mb-3">6-max preflop ranges</h1>
        <p className="text-gray-400 mb-10 max-w-[62ch] leading-relaxed">
          Thirty-five charts for 100bb 6-max cash: what to open from each seat, how to
          defend when someone opens in front of you, and what to do when your open gets
          3-bet. Every chart is also drillable hand by hand in the{" "}
          <Link href="/" className="text-[#d3ac47] underline underline-offset-2">trainer</Link>.
        </p>

        {SECTIONS.map(({ kind, title, blurb }) => {
          const spots = SPOTS.filter((s) => s.kind === kind);
          return (
            <section key={kind} className="mb-10">
              <h2 className="text-lg font-semibold mb-1">{title}</h2>
              <p className="text-sm text-gray-500 mb-4">{blurb}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {spots.map((s) => (
                  <li key={spotSlug(s)}>
                    <Link
                      href={`/range/${spotSlug(s)}`}
                      className="block rounded-lg border border-white/10 bg-[#141c23] px-4 py-3 hover:border-[#d3ac47]"
                    >
                      <span className="block font-semibold text-[#d3ac47]">{spotHeading(s)}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">{spotBlurb(s)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}

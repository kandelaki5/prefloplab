import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ALL_HANDS, comboCount } from "@/lib/ranges";
import { RangeGrid, RangeLegend } from "@/components/RangeGrid";
import { Logo } from "@/components/Logo";
import {
  SPOTS, spotBlurb, spotFromSlug, spotHeading, spotIsRaiseFold, spotSixths,
  spotSlug, spotTitle, type Spot,
} from "@/lib/spots";

export function generateStaticParams() {
  return SPOTS.map((s) => ({ slug: spotSlug(s) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const spot = spotFromSlug(slug);
  if (!spot) return {};

  const title = spotTitle(spot);
  const description = spotBlurb(spot);
  return {
    title,
    description,
    alternates: { canonical: `/range/${slug}` },
    openGraph: { title, description, url: `/range/${slug}`, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Hands grouped by what you do with them, for the written-out lists that
 *  make the page readable (and indexable) without running any JavaScript. */
function buckets(spot: Spot) {
  const pureRaise: string[] = [];
  const pureCall: string[] = [];
  const pureFold: string[] = [];
  const mixed: { hand: string; raise: number; call: number; fold: number }[] = [];
  let combos = 0;
  let raiseCombos = 0;
  let callCombos = 0;

  for (const hand of ALL_HANDS) {
    const s = spotSixths(spot, hand);
    if (!s) continue;
    const fold = 6 - s.raise - s.call;
    const w = comboCount(hand);
    combos += w;
    raiseCombos += (w * s.raise) / 6;
    callCombos += (w * s.call) / 6;

    if (s.raise === 6) pureRaise.push(hand);
    else if (s.call === 6) pureCall.push(hand);
    else if (fold === 6) pureFold.push(hand);
    else mixed.push({ hand, raise: s.raise, call: s.call, fold });
  }

  const pct = (n: number) => (combos ? Math.round((n / combos) * 1000) / 10 : 0);
  return {
    pureRaise, pureCall, pureFold, mixed,
    raisePct: pct(raiseCombos),
    callPct: pct(callCombos),
    foldPct: pct(combos - raiseCombos - callCombos),
  };
}

function HandList({ label, hands }: { label: string; hands: string[] }) {
  if (!hands.length) return null;
  return (
    <p className="text-sm text-gray-300 leading-relaxed">
      <span className="text-[#d3ac47] font-semibold">{label}:</span>{" "}
      <span className="text-gray-400">{hands.join(", ")}</span>
    </p>
  );
}

export default async function RangePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const spot = spotFromSlug(slug);
  if (!spot) notFound();

  const raiseFold = spotIsRaiseFold(spot);
  const b = buckets(spot);
  const raiseWord = spot.kind === "rfi" ? "Raise" : spot.kind === "vs" ? "3-bet" : "4-bet";

  const others = SPOTS.filter((s) => s.kind === spot.kind && spotSlug(s) !== slug).slice(0, 6);

  return (
    <main className="min-h-screen bg-black text-white px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[760px]">
        <nav className="mb-8 flex items-center gap-2 text-xs text-gray-500">
          <Link href="/" className="flex items-center gap-2 hover:text-[#d3ac47]">
            <Logo className="w-6 h-6" />
            PrefLopLab
          </Link>
          <span>/</span>
          <Link href="/range" className="hover:text-[#d3ac47]">Ranges</Link>
        </nav>

        <h1 className="text-2xl sm:text-4xl font-bold mb-3">{spotHeading(spot)}</h1>
        <p className="text-gray-400 mb-6 leading-relaxed">{spotBlurb(spot)}</p>

        <div className="mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-gray-400">
            <span className="text-[#b6472b] font-semibold">{raiseWord}</span> {b.raisePct}%
          </span>
          {!raiseFold && (
            <span className="text-gray-400">
              <span className="text-[#3f8a4c] font-semibold">Call</span> {b.callPct}%
            </span>
          )}
          <span className="text-gray-400">
            <span className="text-gray-300 font-semibold">Fold</span> {b.foldPct}%
          </span>
        </div>

        <div className="mb-3">
          <RangeLegend call={!raiseFold} na={spot.kind === "vs3bet"} />
        </div>
        <div className="mb-8">
          <RangeGrid sixths={(h) => spotSixths(spot, h)} />
        </div>

        <section className="space-y-3 mb-10">
          <h2 className="text-lg font-semibold">Hand by hand</h2>
          <HandList label={`Always ${raiseWord.toLowerCase()}`} hands={b.pureRaise} />
          {!raiseFold && <HandList label="Always call" hands={b.pureCall} />}
          {b.mixed.length > 0 && (
            <div className="text-sm text-gray-300 leading-relaxed">
              <span className="text-[#d3ac47] font-semibold">Mixed</span>{" "}
              <span className="text-gray-500">(a die roll decides — low is passive, high aggressive):</span>{" "}
              <span className="text-gray-400">
                {b.mixed
                  .map((m) => {
                    const parts = [
                      m.raise > 0 ? `${m.raise}/6 ${raiseWord.toLowerCase()}` : null,
                      m.call > 0 ? `${m.call}/6 call` : null,
                      m.fold > 0 ? `${m.fold}/6 fold` : null,
                    ].filter(Boolean);
                    return `${m.hand} (${parts.join(", ")})`;
                  })
                  .join("; ")}
              </span>
            </div>
          )}
          <HandList label="Always fold" hands={b.pureFold} />
        </section>

        <Link
          href={`/?spot=${slug}`}
          className="inline-block rounded-xl bg-[#d3ac47] px-6 py-3 font-semibold text-[#221703]"
        >
          Drill this in the trainer
        </Link>

        {others.length > 0 && (
          <section className="mt-12 border-t border-white/10 pt-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-300">Related ranges</h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {others.map((s) => (
                <li key={spotSlug(s)}>
                  <Link href={`/range/${spotSlug(s)}`} className="text-gray-400 hover:text-[#d3ac47]">
                    {spotHeading(s)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

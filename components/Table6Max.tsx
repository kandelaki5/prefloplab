import type { ReactNode } from "react";

const SEATS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// Elliptical layout (not circular translate+rotate) so all 6 seats sit at
// a consistent inset from the rail on both axes — the table itself is an
// ellipse, so equal angular spacing needs unequal x/y radii to look
// symmetric.
//
// Offsets are stored as a percentage of the felt, not in pixels, so the
// whole table scales with its container: one layout from a 390px phone up
// to the 460px desktop size.
const FELT_W = 436; // 460 design width minus the p-3 rail on each side
const FELT_H = 256;
const RADIUS_X = 172;
const RADIUS_Y = 90;

const SEAT_OFFSETS = SEATS.map((_, i) => {
  const angle = (i * 60 * Math.PI) / 180;
  return {
    left: 50 + ((RADIUS_X * Math.cos(angle)) / FELT_W) * 100,
    top: 50 + ((RADIUS_Y * Math.sin(angle)) / FELT_H) * 100,
  };
});

/** `opener` (if given) is the seat that already raised — shown in copper,
 *  distinct from `hero` (the seat on turn), shown in gold. `children` is
 *  rendered in the middle of the felt (the die lives there on phones,
 *  where there is no room for it beside the table). */
export function Table6Max({
  hero,
  opener,
  children,
}: {
  hero: string;
  opener?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative w-full max-w-[460px] aspect-[460/280] rounded-full p-2 sm:p-3 shadow-2xl"
      style={{ background: "linear-gradient(155deg, #8a6a30 0%, #5c421c 55%, #3a290f 100%)" }}
    >
      <div
        className="relative w-full h-full rounded-full overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, #1e7a4d 0%, #135334 55%, #0a2f1d 100%)",
          boxShadow: "inset 0 0 50px rgba(0,0,0,0.55), inset 0 0 2px rgba(255,255,255,0.15)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {children ?? (
            <span className="text-emerald-100/25 text-[10px] sm:text-xs font-medium tracking-[0.3em] uppercase">
              PrefLopLab
            </span>
          )}
        </div>

        {SEATS.map((seat, i) => (
          <div
            key={seat}
            className={`absolute -translate-x-1/2 -translate-y-1/2 text-[11px] sm:text-sm font-semibold tracking-wide px-2.5 py-1 sm:px-4 sm:py-2 rounded-full border transition-colors ${
              seat === hero
                ? "bg-[#d3ac47] text-[#221703] border-[#f0d27e] shadow-[0_0_14px_rgba(211,172,71,0.55)]"
                : seat === opener
                  ? "bg-[#b6472b] text-[#fbe6db] border-[#d9724f] shadow-[0_0_12px_rgba(182,71,43,0.5)]"
                  : "bg-black/45 text-emerald-50/80 border-white/10 backdrop-blur-sm"
            }`}
            style={{ left: `${SEAT_OFFSETS[i].left}%`, top: `${SEAT_OFFSETS[i].top}%` }}
          >
            {seat}
          </div>
        ))}
      </div>
    </div>
  );
}

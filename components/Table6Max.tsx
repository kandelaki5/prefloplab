const SEATS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// Elliptical layout (not circular translate+rotate) so all 6 seats sit at
// a consistent inset from the rail on both axes — the table itself is an
// ellipse (460x280), so equal angular spacing needs unequal x/y radii to
// look symmetric.
const RADIUS_X = 172;
const RADIUS_Y = 90;

const SEAT_OFFSETS = SEATS.map((_, i) => {
  const angle = (i * 60 * Math.PI) / 180;
  return { dx: RADIUS_X * Math.cos(angle), dy: RADIUS_Y * Math.sin(angle) };
});

/** `opener` (if given) is the seat that already raised — shown in copper,
 *  distinct from `hero` (the seat on turn), shown in gold. */
export function Table6Max({ hero, opener }: { hero: string; opener?: string }) {
  return (
    <div
      className="relative w-[460px] h-[280px] rounded-full mb-10 p-3 shadow-2xl"
      style={{ background: "linear-gradient(155deg, #8a6a30 0%, #5c421c 55%, #3a290f 100%)" }}
    >
      <div
        className="relative w-full h-full rounded-full overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, #1e7a4d 0%, #135334 55%, #0a2f1d 100%)",
          boxShadow: "inset 0 0 50px rgba(0,0,0,0.55), inset 0 0 2px rgba(255,255,255,0.15)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-emerald-100/25 text-xs font-medium tracking-[0.3em] uppercase">
          PrefLopLab
        </div>

        {SEATS.map((seat, i) => (
          <div
            key={seat}
            className={`absolute left-1/2 top-1/2 text-sm font-semibold tracking-wide px-4 py-2 rounded-full border transition-colors ${
              seat === hero
                ? "bg-[#d3ac47] text-[#221703] border-[#f0d27e] shadow-[0_0_14px_rgba(211,172,71,0.55)]"
                : seat === opener
                  ? "bg-[#b6472b] text-[#fbe6db] border-[#d9724f] shadow-[0_0_12px_rgba(182,71,43,0.5)]"
                  : "bg-black/45 text-emerald-50/80 border-white/10 backdrop-blur-sm"
            }`}
            style={{
              transform: `translate(calc(-50% + ${SEAT_OFFSETS[i].dx}px), calc(-50% + ${SEAT_OFFSETS[i].dy}px))`,
            }}
          >
            {seat}
          </div>
        ))}
      </div>
    </div>
  );
}

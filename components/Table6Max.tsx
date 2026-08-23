const SEATS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

export function Table6Max({ hero }: { hero: string }) {
  return (
    <div
      className="relative w-[460px] h-[280px] rounded-full mb-10 p-3 shadow-2xl"
      style={{ background: "linear-gradient(155deg, #8a6a30 0%, #5c421c 55%, #3a290f 100%)" }}
    >
      <div
        className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, #1e7a4d 0%, #135334 55%, #0a2f1d 100%)",
          boxShadow: "inset 0 0 50px rgba(0,0,0,0.55), inset 0 0 2px rgba(255,255,255,0.15)",
        }}
      >
        <div className="text-emerald-100/25 text-xs font-medium tracking-[0.3em] uppercase">
          PrefLopLab
        </div>

        {SEATS.map((seat, i) => (
          <div
            key={seat}
            className={`absolute text-xs font-semibold tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
              seat === hero
                ? "bg-[#d3ac47] text-[#221703] border-[#f0d27e] shadow-[0_0_14px_rgba(211,172,71,0.55)]"
                : "bg-black/45 text-emerald-50/80 border-white/10 backdrop-blur-sm"
            }`}
            style={{
              transform: `rotate(${i * 60}deg) translate(140px) rotate(-${i * 60}deg)`,
            }}
          >
            {seat}
          </div>
        ))}
      </div>
    </div>
  );
}

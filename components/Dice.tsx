const PIPS: Record<number, [number, number][]> = {
  1: [[40, 40]],
  2: [[22, 22], [58, 58]],
  3: [[22, 22], [40, 40], [58, 58]],
  4: [[22, 22], [58, 22], [22, 58], [58, 58]],
  5: [[22, 22], [58, 22], [40, 40], [22, 58], [58, 58]],
  6: [[22, 18], [58, 18], [22, 40], [58, 40], [22, 62], [58, 62]],
};

/** A rolled six-sided die — shown next to the table so a mixed-frequency
 *  hand can be resolved the way a real player would: roll something
 *  random, act on a threshold. `active` highlights it when the current
 *  hand actually needs the roll; otherwise it sits dim and unused. */
export function Dice({ value, active }: { value: number; active: boolean }) {
  const pips = PIPS[value] ?? [];

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 80 80"
        width="64"
        height="64"
        role="img"
        aria-label={`Die showing ${value}`}
        className={`transition-transform duration-300 ${active ? "drop-shadow-[0_0_10px_rgba(211,172,71,0.5)]" : "opacity-40"}`}
        style={{ transform: active ? "rotate(0deg)" : "rotate(-4deg)" }}
      >
        <defs>
          <linearGradient id="die-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffdf6" />
            <stop offset="100%" stopColor="#eee3c8" />
          </linearGradient>
        </defs>
        <rect
          x="2"
          y="2"
          width="76"
          height="76"
          rx="14"
          fill="url(#die-face)"
          stroke={active ? "#d3ac47" : "#7a725c"}
          strokeWidth="2.5"
        />
        {pips.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="6.5" fill="#221703" />
        ))}
      </svg>
      <span className={`text-[10px] uppercase tracking-widest ${active ? "text-[#d3ac47]" : "text-zinc-600"}`}>
        {active ? "Mixed — roll decides" : "Not needed"}
      </span>
    </div>
  );
}

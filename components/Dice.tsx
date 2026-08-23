const PIPS: Record<number, [number, number][]> = {
  1: [[40, 40]],
  2: [[22, 22], [58, 58]],
  3: [[22, 22], [40, 40], [58, 58]],
  4: [[22, 22], [58, 22], [22, 58], [58, 58]],
  5: [[22, 22], [58, 22], [40, 40], [22, 58], [58, 58]],
  6: [[22, 18], [58, 18], [22, 40], [58, 40], [22, 62], [58, 62]],
};

/** A rolled six-sided die — shown next to the table on every hand. Low
 *  rolls are the passive end (Fold), high rolls the aggressive end
 *  (Raise), for whenever the dealt hand needs it. */
export function Dice({ value }: { value: number }) {
  const pips = PIPS[value] ?? [];

  return (
    <svg
      viewBox="0 0 80 80"
      width="64"
      height="64"
      role="img"
      aria-label={`Die showing ${value}`}
      className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
    >
      <defs>
        <linearGradient id="die-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffdf6" />
          <stop offset="100%" stopColor="#eee3c8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="76" height="76" rx="14" fill="url(#die-face)" stroke="#d3ac47" strokeWidth="2.5" />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="6.5" fill="#221703" />
      ))}
    </svg>
  );
}

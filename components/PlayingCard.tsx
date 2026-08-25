const SUIT_COLOR: Record<string, string> = {
  "♠": "#20242a",
  "♣": "#20242a",
  "♥": "#b7333f",
  "♦": "#b7333f",
};

const RANK_DISPLAY: Record<string, string> = { T: "10" };

/** A crisp, self-contained SVG playing card — no external image requests. */
export function PlayingCard({ card }: { card: string }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const color = SUIT_COLOR[suit] ?? "#20242a";
  const label = RANK_DISPLAY[rank] ?? rank;
  const cornerFontSize = label.length > 1 ? 15 : 18;

  return (
    <svg
      viewBox="0 0 80 112"
      role="img"
      aria-label={`${label} of ${suit}`}
      className="w-16 h-[89.6px] sm:w-20 sm:h-28 shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
    >
      <defs>
        <linearGradient id={`face-${rank}${suit}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fffdf6" />
          <stop offset="100%" stopColor="#f2ead4" />
        </linearGradient>
      </defs>

      <rect
        x="1.5"
        y="1.5"
        width="77"
        height="109"
        rx="9"
        fill={`url(#face-${rank}${suit})`}
        stroke="#c9a13a"
        strokeWidth="1.25"
      />

      <text x="8" y="20" fontSize={cornerFontSize} fontWeight="700" fill={color} fontFamily="Georgia, serif">
        {label}
      </text>
      <text x="8.5" y="33" fontSize="13" fill={color}>
        {suit}
      </text>

      <text x="40" y="66" fontSize="34" fill={color} textAnchor="middle" dominantBaseline="middle">
        {suit}
      </text>

      <g transform="translate(80,112) rotate(180)">
        <text x="8" y="20" fontSize={cornerFontSize} fontWeight="700" fill={color} fontFamily="Georgia, serif">
          {label}
        </text>
        <text x="8.5" y="33" fontSize="13" fill={color}>
          {suit}
        </text>
      </g>
    </svg>
  );
}

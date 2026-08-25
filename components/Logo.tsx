const CREAM = "#f2ead4";
const CREAM_BACK = "#ded5bd";
const RED = "#d81f33";
const NAVY = "#1b2434";

/** Two fanned cards behind an overlapping P/L monogram — the PrefLopLab
 *  mark, drawn as vectors so it stays crisp at any size and needs no
 *  card-coloured plate behind it on the page's black background. */
export function Logo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 110" role="img" aria-label="PrefLopLab" className={className}>
      {/* back card, fanned left */}
      <g transform="rotate(-12 41 55)">
        <rect x="16" y="20" width="50" height="70" rx="6" fill={CREAM_BACK} />
        <path
          d="M28 32c1.5-2 4.2-1.2 4.2.9 0 2.2-2.4 3.9-4.2 5.2-1.8-1.3-4.2-3-4.2-5.2 0-2.1 2.7-2.9 4.2-.9z"
          fill={RED}
        />
      </g>

      {/* front card, fanned right */}
      <g transform="rotate(12 79 51)">
        <rect x="54" y="16" width="50" height="70" rx="6" fill={CREAM} />
        <path
          d="M88 25c2.4 2.4 4.8 4 4.8 6.2 0 1.7-1.4 2.7-2.8 2.7-.9 0-1.6-.4-2-.9.1 1.2.5 2.4 1.3 3.3h-2.6c.8-.9 1.2-2.1 1.3-3.3-.4.5-1.1.9-2 .9-1.4 0-2.8-1-2.8-2.7 0-2.2 2.4-3.8 4.8-6.2z"
          fill={NAVY}
        />
        <path
          d="M95 58c1.5-2 4.2-1.2 4.2.9 0 2.2-2.4 3.9-4.2 5.2-1.8-1.3-4.2-3-4.2-5.2 0-2.1 2.7-2.9 4.2-.9z"
          fill={RED}
        />
      </g>

      {/* P, with its counter cut out so the card shows through */}
      <path
        d="M34 27h26a15 15 0 0 1 0 30H46v26H34z M46 37h13a5 5 0 0 1 0 10H46z"
        fill={RED}
        fillRule="evenodd"
      />

      {/* L, overlapping the P's bowl the way the mark does */}
      <path d="M62 45h12v26h18v12H62z" fill={NAVY} />
    </svg>
  );
}

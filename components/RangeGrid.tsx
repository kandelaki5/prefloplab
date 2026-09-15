import type { CSSProperties } from "react";
import { HAND_GRID, type Facing } from "@/lib/ranges";

export const RAISE_COLOR = "#b6472b";
export const CALL_COLOR = "#3f8a4c";
export const FOLD_COLOR = "#2a3742";
export const NA_COLOR = "#2b2b2b";

/** Grid cell fill: a solid color for pure hands, a proportional 3-way
 *  split for mixed ones (raise | call | fold, left to right). */
export function cellStyle(raise: number, call: number): CSSProperties {
  const raisePct = (raise / 6) * 100;
  const callEndPct = ((raise + call) / 6) * 100;
  return {
    backgroundImage: `linear-gradient(to right, ${RAISE_COLOR} ${raisePct}%, ${CALL_COLOR} ${raisePct}%, ${CALL_COLOR} ${callEndPct}%, ${FOLD_COLOR} ${callEndPct}%)`,
  };
}

/** The 13x13 chart. `sixths` returns null for a hand hero can't hold in
 *  this spot, which greys the cell out. */
export function RangeGrid({ sixths }: { sixths: (hand: string) => Facing | null }) {
  return (
    <div className="grid grid-cols-13 gap-px sm:gap-[2px] w-full">
      {HAND_GRID.flat().map((h) => {
        const s = sixths(h);
        return (
          <div
            key={h}
            title={h}
            className="aspect-square rounded-[2px] sm:rounded flex items-center justify-center text-[7px] sm:text-[9px] leading-none font-medium"
            style={
              s
                ? { ...cellStyle(s.raise, s.call), color: "#f5ede0" }
                : { background: NA_COLOR, color: "#71717a" }
            }
          >
            {h}
          </div>
        );
      })}
    </div>
  );
}

/** Colour key. `na` is only meaningful facing a 3-bet, where some hands
 *  are unreachable because hero would never have opened them. */
export function RangeLegend({ call = true, na = false }: { call?: boolean; na?: boolean }) {
  const item = (color: string, label: string) => (
    <span key={label} className="flex items-center gap-1">
      <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
      {item(RAISE_COLOR, "Raise")}
      {call && item(CALL_COLOR, "Call")}
      {item(FOLD_COLOR, "Fold")}
      {na && item(NA_COLOR, "Never opened")}
    </div>
  );
}

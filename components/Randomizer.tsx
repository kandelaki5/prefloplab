"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/** How long a number stays up before it rerolls itself. */
const INTERVAL_MS = 10_000;
/** How often the countdown bar redraws. Fine enough that the bar drains
 *  smoothly, coarse enough that it costs nothing. */
const TICK_MS = 50;

type PipOptions = {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
};

// Document Picture-in-Picture is the only way a web page can put a window
// above every other app. It is Chromium-only and not in lib.dom yet.
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: PipOptions): Promise<Window>;
      window: Window | null;
    };
  }
}

/** 0–100 inclusive, drawn from the crypto RNG. The top of the byte range is
 *  thrown away because 256 is not a multiple of 101 — without that, 0–53
 *  would come up slightly more often than 54–100, which is exactly the bias
 *  a randomizer must not have. */
function roll101(): number {
  const limit = 256 - (256 % 101); // 202
  const rng = globalThis.crypto;

  if (rng?.getRandomValues) {
    const buf = new Uint8Array(1);
    // Each draw has a >78% chance of landing under the limit, so this
    // effectively never runs out; the cap is only there to guarantee return.
    for (let i = 0; i < 32; i++) {
      rng.getRandomValues(buf);
      if (buf[0] < limit) return buf[0] % 101;
    }
  }
  return Math.floor(Math.random() * 101);
}

/** The floating window is a fresh, empty document — none of the page's CSS
 *  comes with it, so Tailwind's stylesheet has to be carried across by hand. */
function copyStyles(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      const style = target.document.createElement("style");
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      // A cross-origin sheet refuses to hand over its rules; link it instead.
      if (!sheet.href) continue;
      const link = target.document.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  }
}

/** The number itself: felt, a gold digit, and a bar draining towards the
 *  next reroll. `filled` makes it take the whole window instead of sitting
 *  as a card on the page, and sizes the digit off the viewport so it stays
 *  readable however small the floating window is dragged. */
function Dial({
  value,
  remaining,
  onRoll,
  filled = false,
}: {
  value: number | null;
  remaining: number;
  onRoll: () => void;
  filled?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (remaining / INTERVAL_MS) * 100));

  return (
    <button
      type="button"
      onClick={onRoll}
      aria-label={value === null ? "Rolling" : `Random number ${value}. Click to reroll.`}
      className={`relative flex flex-col items-center justify-center overflow-hidden border border-[#d3ac47]/40 shadow-2xl transition-[border-color] hover:border-[#d3ac47] ${
        filled ? "h-full w-full rounded-none" : "h-60 w-60 rounded-3xl sm:h-72 sm:w-72"
      }`}
      style={{
        background: "radial-gradient(ellipse at 50% 38%, #1e7a4d 0%, #135334 55%, #0a2f1d 100%)",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.55), inset 0 0 2px rgba(255,255,255,0.15)",
      }}
    >
      <span
        className="font-bold leading-none text-[#d3ac47] tabular-nums drop-shadow-[0_3px_10px_rgba(0,0,0,0.6)]"
        style={{ fontSize: filled ? "min(34vw, 40vh)" : "5.5rem" }}
      >
        {value ?? "—"}
      </span>

      <span
        className="mt-2 uppercase tracking-[0.25em] text-emerald-100/45"
        style={{ fontSize: filled ? "min(3.4vw, 4vh)" : "0.625rem" }}
      >
        click to reroll
      </span>

      {/* Countdown to the automatic reroll. Width comes from state rather
          than a CSS animation so it survives into the floating window, which
          gets the markup but not necessarily every stylesheet. */}
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/35">
        <span className="block h-full bg-[#d3ac47]/80" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function isCompactHash() {
  return window.location.hash === "#compact";
}

export function Randomizer() {
  const [value, setValue] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(INTERVAL_MS);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipError, setPipError] = useState<string | null>(null);
  // Read off the URL rather than held in state, so the server and the first
  // client render agree (the server has no hash at all).
  const compact = useSyncExternalStore(subscribeToHash, isCompactHash, () => false);

  // Starts in the past, so the countdown below draws the first number on its
  // very first tick. Rolling during render or in an effect body would put a
  // number in the server HTML that the client then contradicts.
  const deadlineRef = useRef(0);

  const roll = useCallback(() => {
    setValue(roll101());
    setRemaining(INTERVAL_MS);
    deadlineRef.current = Date.now() + INTERVAL_MS;
  }, []);

  // Chrome throttles timers on a hidden tab down to roughly one a minute, and
  // the tab behind a floating window counts as hidden. So the countdown runs
  // on whichever window is actually on screen, and works off a deadline
  // rather than a tick count, so a throttled tab catches up instead of drifting.
  useEffect(() => {
    const host = pipWindow ?? window;
    const id = host.setInterval(() => {
      const left = deadlineRef.current - Date.now();
      if (left <= 0) roll();
      else setRemaining(left);
    }, TICK_MS);
    return () => host.clearInterval(id);
  }, [pipWindow, roll]);

  const openFloating = useCallback(async () => {
    const dpip = window.documentPictureInPicture;
    if (!dpip) {
      setPipError(
        "This browser has no always-on-top window. Chrome, Edge, or another Chromium browser can do it — or use the plain popup below and keep it on top with your window manager.",
      );
      return;
    }

    try {
      const win = await dpip.requestWindow({ width: 260, height: 230, disallowReturnToOpener: true });
      copyStyles(win);
      win.document.documentElement.style.height = "100%";
      Object.assign(win.document.body.style, { height: "100%", margin: "0", background: "#000" });
      // Closing it (its own button, or the tab going away) has to put the
      // dial back on the page, or the number would vanish with the window.
      win.addEventListener("pagehide", () => setPipWindow(null), { once: true });
      setPipError(null);
      setPipWindow(win);
    } catch {
      setPipError("The floating window could not be opened. Try clicking the button again.");
    }
  }, []);

  const dial = <Dial value={value} remaining={remaining} onRoll={roll} filled={compact} />;

  // `#compact` is the popup fallback for browsers without an always-on-top
  // window: the same dial, alone, in a window small enough to park anywhere.
  if (compact) {
    return <main className="h-screen w-screen bg-black">{dial}</main>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black px-4 py-10 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold sm:text-3xl">Randomizer</h1>
        <p className="mt-1 text-sm text-gray-400">
          A fresh number from 0 to 100 every 10 seconds — for playing a mixed strategy honestly.
        </p>
      </div>

      {pipWindow ? (
        <div className="flex h-60 w-60 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/15 px-6 text-center sm:h-72 sm:w-72">
          <span className="text-sm text-gray-400">The randomizer is floating on top of your other windows.</span>
          <button
            type="button"
            onClick={() => pipWindow.close()}
            className="rounded-xl bg-[#1c2831] px-4 py-2 text-sm font-semibold text-[#c3d3dc] hover:bg-[#243440]"
          >
            Bring it back here
          </button>
        </div>
      ) : (
        dial
      )}

      {!pipWindow && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={openFloating}
            className="rounded-xl bg-[#d3ac47] px-5 py-3 font-semibold text-[#221703] hover:bg-[#e2bf60]"
          >
            Float on top
          </button>
          <button
            type="button"
            onClick={() =>
              window.open(
                "/randomizer#compact",
                "prefloplab-randomizer",
                "popup=yes,width=260,height=230",
              )
            }
            className="rounded-xl border border-white/10 bg-[#1c2831] px-5 py-3 font-semibold text-[#c3d3dc] hover:bg-[#243440]"
          >
            Open as a popup
          </button>
        </div>
      )}

      {pipError && <p className="max-w-md text-center text-sm text-[#e0895f]">{pipError}</p>}

      <p className="max-w-md text-center text-xs leading-relaxed text-gray-500">
        The number rerolls on its own every 10 seconds, and instantly if you click it. Say your range calls for a
        3-bet 30% of the time: 3-bet when the number is under 30, flat when it is not.
      </p>

      {pipWindow &&
        createPortal(
          <div className="h-full w-full">
            <Dial value={value} remaining={remaining} onRoll={roll} filled />
          </div>,
          pipWindow.document.body,
        )}
    </main>
  );
}

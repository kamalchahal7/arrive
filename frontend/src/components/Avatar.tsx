"use client";

// The Arrive helper: a friendly illustrated character (not a person, so it carries no ethnicity, gender or
// religious signal). States: idle, speaking, listening, thinking. While speaking its mouth follows the audio level;
// while listening a ring follows the microphone level. With reduced motion it stays still and a small badge shows
// the state. The state is always also given as text for screen readers (docs/REDESIGN.md 4.3).

import { Ear, Loader2, Smile, Volume2 } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

export type AvatarState = "idle" | "speaking" | "listening" | "thinking";

const BADGE = { idle: Smile, speaking: Volume2, listening: Ear, thinking: Loader2 } as const;

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
  mq.addEventListener("change", cb);
  return () => {
    mq.removeEventListener("change", cb);
    obs.disconnect();
  };
}

function reducedMotion(): boolean {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.dataset.reduceMotion === "true"
  );
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
}

export function Avatar({
  state,
  label,
  getLevel,
  size = 176,
}: {
  state: AvatarState;
  /** The state in words ("Speaking…"), announced politely. */
  label: string;
  /** 0..1: the voice level while speaking, the microphone level while listening. */
  getLevel?: () => number;
  size?: number;
}) {
  const still = useReducedMotion();
  const mouth = useRef<SVGEllipseElement>(null);
  const ring = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (still || (state !== "speaking" && state !== "listening")) return;
    let frame = 0;
    let smooth = 0;
    const tick = () => {
      const target = getLevel ? getLevel() : 0;
      smooth += (target - smooth) * 0.35;
      if (state === "speaking" && mouth.current) {
        mouth.current.setAttribute("ry", String(3 + smooth * 13));
        mouth.current.setAttribute("rx", String(14 - smooth * 3));
      }
      if (state === "listening" && ring.current) {
        ring.current.setAttribute("r", String(90 + smooth * 12));
        ring.current.style.opacity = String(0.25 + smooth * 0.6);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const ringEl = ring.current;
    return () => {
      cancelAnimationFrame(frame);
      // Passive effects clean up after React has already painted the new state, so a last animation frame can
      // write the old level back. Reset what the loop touched.
      if (ringEl) {
        ringEl.setAttribute("r", "90");
        ringEl.style.opacity = "0";
      }
    };
  }, [state, still, getLevel]);

  const Badge = BADGE[state];
  const small = size < 120;
  const speaking = state === "speaking";
  // Pupils glance up and to the side while thinking.
  const look = state === "thinking" ? "translate(3 -4)" : state === "listening" ? "translate(0 -1)" : undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          aria-hidden
          className={`overflow-visible ${!still && state === "idle" ? "avatar-breathe" : ""}`}
        >
          {/* listening ring */}
          <circle
            ref={ring}
            cx="100"
            cy="104"
            r="90"
            fill="none"
            stroke="var(--color-teal)"
            strokeWidth="5"
            style={{ opacity: state === "listening" ? 0.35 : 0, transition: "opacity 200ms" }}
          />
          <ellipse cx="100" cy="190" rx="52" ry="7" fill="var(--color-line)" />
          {/* body */}
          <path
            d="M100 22c44 0 76 30 76 76 0 46-30 84-76 84S24 144 24 98c0-46 32-76 76-76z"
            fill="var(--color-teal)"
          />
          {/* sprout on top */}
          <path d="M100 24c-2-10 2-17 12-20-1 9-5 15-12 20z" fill="#7fb8a8" />
          {/* face */}
          <ellipse cx="100" cy="104" rx="56" ry="50" fill="#f6f3ec" />
          {/* cheeks */}
          <ellipse cx="64" cy="118" rx="9" ry="6" fill="#f3c9a6" opacity="0.8" />
          <ellipse cx="136" cy="118" rx="9" ry="6" fill="#f3c9a6" opacity="0.8" />
          {/* eyes */}
          <g className={!still && state !== "thinking" ? "avatar-blink" : ""} style={{ transformOrigin: "100px 96px" }}>
            <ellipse cx="80" cy="96" rx="8" ry={state === "listening" ? 10 : 9} fill="#1c2321" />
            <ellipse cx="120" cy="96" rx="8" ry={state === "listening" ? 10 : 9} fill="#1c2321" />
            <g transform={look}>
              <circle cx="82.5" cy="92.5" r="3" fill="#ffffff" />
              <circle cx="122.5" cy="92.5" r="3" fill="#ffffff" />
            </g>
          </g>
          {/* mouth: an open oval while speaking, a smile otherwise */}
          {speaking ? (
            <ellipse ref={mouth} cx="100" cy="126" rx="13" ry={still ? 7 : 4} fill="#8e2a1d" />
          ) : (
            <path
              d={state === "thinking" ? "M88 126q12 4 24 0" : "M84 122q16 16 32 0"}
              fill="none"
              stroke="#1c2321"
              strokeWidth="5"
              strokeLinecap="round"
            />
          )}
          {/* thinking dots */}
          {state === "thinking" && (
            <g fill="var(--color-teal)">
              <circle className={still ? "" : "avatar-dot"} cx="152" cy="40" r="6" />
              <circle className={still ? "" : "avatar-dot avatar-dot-2"} cx="170" cy="26" r="7" />
              <circle className={still ? "" : "avatar-dot avatar-dot-3"} cx="190" cy="10" r="8" />
            </g>
          )}
        </svg>
        {/* The badge is the main state cue when motion is reduced, and a helpful extra otherwise. */}
        <span
          className={`absolute end-0 bottom-0 flex items-center justify-center rounded-full border-2 border-surface bg-teal text-white shadow ${
            small ? "size-7" : "size-10"
          }`}
          aria-hidden
        >
          <Badge className={`${small ? "size-4" : "size-5"} ${state === "thinking" && !still ? "animate-spin" : ""}`} />
        </span>
      </div>
      <p aria-live="polite" className="flex items-center gap-2 text-base font-bold text-muted">
        {label}
      </p>
    </div>
  );
}

"use client";

// The "Tap to speak" button and its states (getting ready, listening with a level meter, what was heard).
// Driven by useAbaListener; used by onboarding and the end-of-session survey.

import { Check, Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import { useBi } from "@/components/Bi";
import type { ListenState } from "@/hooks/useAbaListener";

export type SpeakProblem = "notHeard" | "micDenied" | "failed";

function LevelMeter({ getLevel }: { getLevel: () => number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.04, getLevel())})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel]);
  return (
    <div aria-hidden className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-line">
      <div ref={bar} className="h-full w-full origin-left rounded-full bg-brand rtl:origin-right" />
    </div>
  );
}

export function SpeakPanel({
  state,
  onSpeak,
  onCancel,
  getLevel,
  heard,
  problem,
  compact = false,
}: {
  state: ListenState;
  onSpeak: () => void;
  onCancel: () => void;
  getLevel: () => number;
  heard?: { text: string; ok: boolean } | null;
  problem?: SpeakProblem | null;
  compact?: boolean;
}) {
  const b = useBi("Speak");
  const size = compact ? "min-h-14 text-lg" : "min-h-20 text-xl";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      {state === "listening" ? (
        <>
          <LevelMeter getLevel={getLevel} />
          <p role="status" className="text-lg font-bold text-brand">
            {b("listening")}
          </p>
          <button type="button" className="btn btn-secondary min-h-12" onClick={onCancel}>
            <Square aria-hidden className="size-5" />
            {b("cancel")}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onSpeak}
          disabled={state === "connecting"}
          className={`flex w-full items-center justify-center gap-3 rounded-full bg-brand px-6 font-bold text-white hover:bg-brand-hover disabled:opacity-80 ${size}`}
        >
          {state === "connecting" ? <Loader2 aria-hidden className="size-7 animate-spin" /> : <Mic aria-hidden className="size-8" />}
          {state === "connecting" ? b("connecting") : b("speak")}
        </button>
      )}
      {heard && state === "idle" && (
        <p className="flex items-start gap-2 text-muted" dir="auto">
          {heard.ok && <Check aria-hidden className="mt-1 size-5 shrink-0 text-brand" />}
          {b.local("heard", { text: heard.text })}
        </p>
      )}
      {problem && state === "idle" && (
        <p role="alert" className="card w-full bg-amber-light text-amber-ink">
          {b(problem)}
        </p>
      )}
    </div>
  );
}

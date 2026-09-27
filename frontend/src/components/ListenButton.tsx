"use client";

import { Loader2, Square, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { languageInfo } from "@/config/languages";
import { api, errorCode } from "@/lib/api";

type State = "idle" | "loading" | "playing";

// One shared audio element so only one thing reads aloud at a time.
let current: { audio: HTMLAudioElement; stop: () => void } | null = null;

export function ListenButton({
  text,
  language,
  autoPlay = false,
  className = "",
  label,
}: {
  text: string;
  language: string;
  autoPlay?: boolean;
  className?: string;
  label?: string;
}) {
  const t = useTranslations("Common");
  const te = useTranslations("Errors");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = () => {
    if (current) {
      current.audio.pause();
      current = null;
    }
    setState("idle");
  };

  const play = async () => {
    if (!languageInfo(language).tts) return;
    if (state === "playing") return stop();
    current?.stop();
    setError(null);
    setState("loading");
    try {
      if (!urlRef.current) {
        const blob = await api<Blob>("/tts", { method: "POST", body: { text: text.slice(0, 1500), language } });
        urlRef.current = URL.createObjectURL(blob);
      }
      const audio = new Audio(urlRef.current);
      current = { audio, stop };
      audio.onended = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch (err) {
      setState("idle");
      setError(te(errorCode(err) === "offline" ? "offline" : "tts_failed"));
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto read-aloud is an accessibility setting chosen by the person
    if (autoPlay) void play();
    return () => {
      if (current?.stop === stop) current.audio.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No read-aloud button for a language no voice model speaks (for example Tigrinya).
  if (!languageInfo(language).tts) return null;
  const Icon = state === "loading" ? Loader2 : state === "playing" ? Square : Volume2;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={play}
        aria-pressed={state === "playing"}
        className={`btn btn-secondary !min-h-11 !py-1.5 ${className}`}
      >
        <Icon aria-hidden className={`size-5 ${state === "loading" ? "animate-spin" : ""}`} />
        {state === "playing" ? t("stopListening") : state === "loading" ? t("loadingAudio") : label || t("listen")}
      </button>
      {error && (
        <span role="status" className="text-sm text-muted">
          {error}
        </span>
      )}
    </span>
  );
}

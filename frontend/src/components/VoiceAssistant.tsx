"use client";

// The older pages' voice panel (Ask, Is it real?). It starts the same Aba session as Ask Aba (lib/aba.ts).

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Ear, Loader2, Mic, MicOff, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { sessionOptions } from "@/lib/aba";
import { errorCode } from "@/lib/api";
import { track } from "@/lib/events";
import { getProfileId } from "@/lib/storage";

type Phase = "idle" | "permission" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "denied" | "error";
type Line = { role: "user" | "agent"; text: string };

const PHASE_ICON = {
  idle: Mic,
  permission: Mic,
  connecting: Loader2,
  listening: Ear,
  thinking: Sparkles,
  speaking: Volume2,
  ended: Mic,
  denied: MicOff,
  error: MicOff,
} as const;

export type VoicePhase = Phase;
type PanelProps = {
  big: boolean;
  /** Tells the avatar what the agent is doing. */
  onPhase?: (phase: Phase) => void;
  /** Receives a function that returns the current voice level (0..1) for the avatar's mouth and ring. */
  levelSource?: (get: () => number) => void;
};

function Panel({ big, onPhase, levelSource }: PanelProps) {
  const t = useTranslations("Voice");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const thinking = useRef(false);

  const conversation = useConversation({
    onConnect: () => setPhase("listening"),
    onDisconnect: () => setPhase((p) => (p === "error" ? p : "ended")),
    onError: () => {
      setError(te("voice_session_failed"));
      setPhase("error");
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") thinking.current = false;
      setPhase(mode === "speaking" ? "speaking" : thinking.current ? "thinking" : "listening");
    },
    onAgentToolRequest: () => {
      thinking.current = true;
      setPhase("thinking");
    },
    onAgentToolResponse: () => {
      thinking.current = false;
    },
    onMessage: ({ message, role }) => {
      if (!message?.trim()) return;
      if (role === "user") track("assistant_question", locale);
      setLines((prev) => [...prev, { role: role === "user" ? "user" : "agent", text: message }]);
    },
  });

  useEffect(() => onPhase?.(phase), [onPhase, phase]);
  useEffect(() => {
    levelSource?.(() => {
      try {
        return phase === "speaking" ? conversation.getOutputVolume() : phase === "listening" ? conversation.getInputVolume() : 0;
      } catch {
        return 0;
      }
    });
  }, [conversation, levelSource, phase]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      // Ask for the microphone only after the person has read why.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      setPhase("denied");
      return;
    }
    setPhase("connecting");
    setLines([]);
    try {
      conversation.startSession(await sessionOptions("chat", locale, { profileId: getProfileId() }));
    } catch (err) {
      setError(te(errorCode(err) === "offline" ? "offline" : "voice_session_failed"));
      setPhase("error");
    }
  }, [conversation, locale, te]);

  const active = ["connecting", "listening", "thinking", "speaking"].includes(phase);
  const onMain = () => {
    if (active) {
      conversation.endSession();
      setPhase("ended");
    } else {
      setPhase("permission");
    }
  };

  const Icon = PHASE_ICON[phase];
  const statusText =
    phase === "permission" || phase === "denied" || phase === "error" ? t("idle") : t(phase === "idle" ? "idle" : phase);

  return (
    <div className="flex flex-col items-center gap-4">
      {phase === "permission" ? (
        <div className="card flex w-full flex-col gap-3" role="dialog" aria-labelledby="mic-title">
          <h2 id="mic-title" className="flex items-center gap-2 text-lg font-bold">
            <Mic aria-hidden className="size-6 text-brand" />
            {t("micTitle")}
          </h2>
          <p>{t("micBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={connect} autoFocus>
              {t("allow")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPhase("idle")}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onMain}
          aria-pressed={active}
          className={`flex items-center justify-center gap-3 rounded-full font-bold text-white ${
            active ? "bg-danger-ink" : "bg-brand hover:bg-brand-hover"
          } ${big ? "min-h-20 w-full px-8 text-xl" : "min-h-16 px-6 text-lg"}`}
        >
          {active ? <PhoneOff aria-hidden className="size-7" /> : <Mic aria-hidden className="size-7" />}
          {active ? t("stop") : t("start")}
        </button>
      )}

      <p aria-live="polite" className="flex items-center gap-2 font-bold text-ink">
        <Icon aria-hidden className={`size-5 text-brand ${phase === "connecting" ? "animate-spin" : ""}`} />
        {statusText}
      </p>

      {phase === "denied" && (
        <div role="alert" className="card w-full bg-amber-light text-amber-ink">
          <p>{t("denied")}</p>
          <Link href="/ask" className="btn btn-primary mt-3">
            {t("typeInstead")}
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger-ink">
          {error}{" "}
          <Link href="/ask" className="btn-quiet">
            {t("typeInstead")}
          </Link>
        </p>
      )}

      {lines.length > 0 && (
        <section className="w-full" aria-labelledby="transcript-title">
          <h2 id="transcript-title" className="eyebrow mb-2">
            {t("transcript")}
          </h2>
          <ol role="log" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {lines.map((line, i) => (
              <li
                key={i}
                dir="auto"
                className={`rounded-2xl px-4 py-2 ${
                  line.role === "user" ? "self-end bg-brand text-white" : "self-start border border-line bg-surface"
                }`}
              >
                {line.text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

export function VoiceAssistant({ big = false, onPhase, levelSource }: Partial<PanelProps>) {
  return (
    <ConversationProvider>
      <Panel big={big} onPhase={onPhase} levelSource={levelSource} />
    </ConversationProvider>
  );
}

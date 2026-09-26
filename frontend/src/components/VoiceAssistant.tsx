"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { Ear, Loader2, Mic, MicOff, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getProfileId } from "@/lib/storage";

type Phase = "idle" | "permission" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "denied" | "error";
type Line = { role: "user" | "agent"; text: string };
type Session = { agent_id: string; conversation_token?: string; signed_url?: string };

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

function Panel({ big }: { big: boolean }) {
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
      if (message?.trim()) setLines((prev) => [...prev, { role: role === "user" ? "user" : "agent", text: message }]);
    },
  });

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
      const session = await api<Session>("/voice/session");
      const dynamicVariables = { channel: "voice_web", language: locale, profile_id: getProfileId() || "" };
      if (session.conversation_token) {
        conversation.startSession({ conversationToken: session.conversation_token, connectionType: "webrtc", dynamicVariables });
      } else if (session.signed_url) {
        conversation.startSession({ signedUrl: session.signed_url, connectionType: "websocket", dynamicVariables });
      } else {
        throw new Error("no session");
      }
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
            <Mic aria-hidden className="size-6 text-teal" />
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
            active ? "bg-danger-ink" : "bg-teal hover:bg-teal-hover"
          } ${big ? "min-h-20 w-full px-8 text-xl" : "min-h-16 px-6 text-lg"}`}
        >
          {active ? <PhoneOff aria-hidden className="size-7" /> : <Mic aria-hidden className="size-7" />}
          {active ? t("stop") : t("start")}
        </button>
      )}

      <p aria-live="polite" className="flex items-center gap-2 font-bold text-ink">
        <Icon aria-hidden className={`size-5 text-teal ${phase === "connecting" ? "animate-spin" : ""}`} />
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
                  line.role === "user" ? "self-end bg-teal text-white" : "self-start border border-line bg-surface"
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

export function VoiceAssistant({ big = false }: { big?: boolean }) {
  return (
    <ConversationProvider>
      <Panel big={big} />
    </ConversationProvider>
  );
}

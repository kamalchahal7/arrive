"use client";

// Ask Aba: talk to Aba (the ElevenLabs agent) or type a question. Aba greets the person by name, speaks their
// language with the same voice as onboarding, and answers from the Ottawa reference data (lib/aba.ts).

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { ArrowLeft, Loader2, Mic, PhoneOff, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, type AvatarState } from "@/components/Avatar";
import { useBi } from "@/components/Bi";
import { Link } from "@/i18n/navigation";
import { type AbaProfile, sessionOptions } from "@/lib/aba";
import { track } from "@/lib/events";
import { getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";

type Phase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "denied" | "error";
type Line = { role: "user" | "agent"; text: string };

export function AssistantView() {
  return (
    <ConversationProvider>
      <Chat />
    </ConversationProvider>
  );
}

function abaProfile(): AbaProfile {
  const p = getCachedProfile<Profile>();
  if (!p) return null;
  return {
    first_name: p.first_name,
    city_name: p.city_name,
    self_age_group: p.self_age_group,
    adults: p.adults,
    seniors: p.seniors,
    children_0_5: p.children_0_5,
    children_6_17: p.children_6_17,
    disability: Boolean(p.disability_adult || p.disability_senior || p.disability_child),
  };
}

function Chat() {
  const b = useBi("Assistant");
  const bv = useBi("Voice");
  const t = useTranslations("Assistant");
  const ta = useTranslations("Avatar");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textMode, setTextMode] = useState(false);
  const pending = useRef<string | null>(null); // typed before the session was connected
  const log = useRef<HTMLOListElement>(null);

  const conversation = useConversation({
    onConnect: () => {
      setPhase("listening");
      const first = pending.current;
      pending.current = null;
      if (first) window.setTimeout(() => conv.current.sendUserMessage(first), 300);
    },
    onDisconnect: () => setPhase((p) => (p === "error" ? p : "ended")),
    onError: () => {
      setError(te("voice_session_failed"));
      setPhase("error");
    },
    onModeChange: ({ mode }) => setPhase(mode === "speaking" ? "speaking" : "listening"),
    onMessage: ({ message: raw, role }) => {
      // The voice model's delivery tags ("[calm]") are for the voice, not for reading.
      const message = raw?.replace(/\[[a-z ]{1,20}\]\s*/gi, "").trim();
      if (!message) return;
      if (role === "user") {
        track("assistant_question", locale);
        setPhase("thinking");
      }
      setLines((prev) => [...prev, { role: role === "user" ? "user" : "agent", text: message }]);
    },
  });
  const conv = useRef(conversation);
  useEffect(() => {
    conv.current = conversation;
  });
  useEffect(() => {
    log.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  const active = ["connecting", "listening", "thinking", "speaking"].includes(phase);

  const start = useCallback(
    async (typed?: string) => {
      setError(null);
      const textOnly = Boolean(typed);
      if (!textOnly) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          setPhase("denied");
          return;
        }
      }
      setPhase("connecting");
      setTextMode(textOnly);
      pending.current = typed ?? null;
      try {
        const profile = abaProfile();
        const greeting = profile?.first_name ? t("greeting", { name: profile.first_name }) : t("greetingNoName");
        const options = await sessionOptions("chat", locale, { profile, greeting, profileId: getProfileId(), textOnly });
        conv.current.startSession(options);
      } catch {
        setError(te("voice_session_failed"));
        setPhase("error");
      }
    },
    [locale, t, te],
  );

  const stop = () => {
    conv.current.endSession();
    setPhase("ended");
  };

  const send = () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    if (active && phase !== "connecting") conv.current.sendUserMessage(q);
    else if (!active) void start(q);
    else pending.current = q;
  };

  const avatar: AvatarState =
    phase === "speaking" ? "speaking" : phase === "listening" && !textMode ? "listening" : phase === "thinking" || phase === "connecting" ? "thinking" : "idle";
  const getLevel = useCallback(() => {
    try {
      return phase === "speaking" ? conv.current.getOutputVolume() : phase === "listening" ? conv.current.getInputVolume() : 0;
    } catch {
      return 0;
    }
  }, [phase]);
  const status = phase === "denied" || phase === "error" ? null : phase;

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {b("back")}
      </Link>
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={avatar} label={ta(avatar)} getLevel={getLevel} />
        <h1 className="font-display text-3xl font-semibold">{b("title")}</h1>
        <p className="text-lg">{b.local("intro")}</p>
      </div>

      <button
        type="button"
        onClick={active ? stop : () => void start()}
        aria-pressed={active}
        className={`flex min-h-20 w-full items-center justify-center gap-3 rounded-full px-8 text-xl font-bold text-white ${
          active ? "bg-danger-ink" : "bg-brand hover:bg-brand-hover"
        }`}
      >
        {phase === "connecting" ? (
          <Loader2 aria-hidden className="size-7 animate-spin" />
        ) : active ? (
          <PhoneOff aria-hidden className="size-7" />
        ) : (
          <Mic aria-hidden className="size-7" />
        )}
        {active ? bv("stop") : bv("start")}
      </button>
      {status && status !== "idle" && (
        <p aria-live="polite" className="text-center font-bold text-muted">
          {bv.local(status)}
        </p>
      )}
      {phase === "denied" && <p className="card bg-amber-light text-amber-ink">{bv("denied")}</p>}
      {error && (
        <p role="alert" className="card bg-amber-light text-amber-ink">
          {error}
        </p>
      )}

      {lines.length > 0 && (
        <section aria-labelledby="transcript-title">
          <h2 id="transcript-title" className="eyebrow mb-2">
            {bv("transcript")}
          </h2>
          <ol ref={log} role="log" className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {lines.map((line, i) => (
              <li
                key={i}
                dir="auto"
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-lg ${
                  line.role === "user" ? "self-end bg-brand text-white" : "self-start border border-line bg-surface"
                }`}
              >
                <span className="sr-only">{line.role === "user" ? bv.text("you") : bv.text("aba")}: </span>
                {line.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="assistant-q" className="label">
          {b("type")}
        </label>
        <div className="flex gap-2">
          <input
            id="assistant-q"
            className="field min-h-14 flex-1 text-lg"
            dir="auto"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
          />
          <button type="submit" className="btn btn-primary min-h-14" disabled={!question.trim()} aria-label={b.text("send")}>
            <Send aria-hidden className="size-6 rtl:-scale-x-100" />
          </button>
        </div>
      </form>
    </main>
  );
}

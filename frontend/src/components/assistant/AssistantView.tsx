"use client";

// "Ask the avatar" (docs/REDESIGN.md section 8): the avatar and the ElevenLabs web agent (which can read the
// person's checklist, explain a step and mark it done), plus typed questions in the same view. Typed answers come
// only from official sources (/api/ask), with citations.

import { ArrowLeft, Loader2, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { Avatar, type AvatarState } from "@/components/Avatar";
import { ErrorNote } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { type VoicePhase, VoiceAssistant } from "@/components/VoiceAssistant";
import { languageInfo } from "@/config/languages";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { track } from "@/lib/events";
import { getProfileId } from "@/lib/storage";
import type { AskResponse } from "@/lib/types";

const AVATAR: Partial<Record<VoicePhase, AvatarState>> = {
  listening: "listening",
  speaking: "speaking",
  thinking: "thinking",
  connecting: "thinking",
};

export function AssistantView() {
  const t = useTranslations("Assistant");
  const ta = useTranslations("Avatar");
  const ti = useTranslations("Ask");
  const locale = useLocale();
  const { settings } = useSettings();
  const voice = languageInfo(locale).stt;
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const level = useRef<() => number>(() => 0);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<{ q: string; res: AskResponse }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levelSource = useCallback((get: () => number) => {
    level.current = get;
  }, []);
  const getLevel = useCallback(() => level.current(), []);

  const ask = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    track("assistant_question", locale);
    try {
      const res = await api<AskResponse>("/ask", {
        method: "POST",
        body: { question: q.trim(), language: locale, profile_id: getProfileId() || undefined },
      });
      setAnswers((prev) => [...prev, { q: q.trim(), res }]);
      setQuestion("");
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const state = busy ? "thinking" : (AVATAR[phase] ?? "idle");
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={state} label={ta(state)} getLevel={getLevel} />
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-lg">{t("intro")}</p>
      </div>
      {voice ? (
        <VoiceAssistant big onPhase={setPhase} levelSource={levelSource} />
      ) : (
        <p className="card bg-amber-light text-amber-ink">{t("textOnly")}</p>
      )}

      <section aria-labelledby="typed" className="flex flex-col gap-3">
        <h2 id="typed" className="eyebrow text-base">
          {t("type")}
        </h2>
        {answers.map((a, i) => (
          <AnswerCard key={i} question={a.q} res={a.res} autoRead={settings.autoRead} onFollowUp={(f) => void ask(f)} />
        ))}
        {error && <ErrorNote code={error} onRetry={() => void ask(question)} />}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor="assistant-q" className="sr-only">
            {ti("inputLabel")}
          </label>
          <input
            id="assistant-q"
            className="field min-h-14 flex-1 text-lg"
            dir="auto"
            placeholder={ti("placeholder")}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={1000}
          />
          <button type="submit" className="btn btn-primary min-h-14" disabled={busy || !question.trim()} aria-label={ti("send")}>
            {busy ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Send aria-hidden className="size-6 rtl:-scale-x-100" />}
          </button>
        </form>
      </section>
    </main>
  );
}

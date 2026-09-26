"use client";

import { Camera, Loader2, Mic, Send, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AnswerCard } from "@/components/AnswerCard";
import { ErrorNote } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getProfileId } from "@/lib/storage";
import type { AskResponse } from "@/lib/types";

type Turn = { id: number; question: string; res?: AskResponse; error?: string };

export default function AskPage() {
  const t = useTranslations("Ask");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const { settings } = useSettings();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [voice, setVoice] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Only scroll once there is a conversation: scrolling on load moves the browser's keyboard starting point
    // past the skip link and navigation.
    if (turns.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: settings.reduceMotion ? "auto" : "smooth", block: "end" });
  }, [turns, pending, settings.reduceMotion]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (q.length < 2 || pending) return;
    const id = Date.now();
    setTurns((prev) => [...prev, { id, question: q }]);
    setInput("");
    setPending(true);
    try {
      const res = await api<AskResponse>("/ask", {
        method: "POST",
        body: { question: q, language: locale, profile_id: getProfileId() || undefined },
      });
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, res } : turn)));
    } catch (err) {
      setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, error: errorCode(err) } : turn)));
    } finally {
      setPending(false);
    }
  };

  const examples = [t("example1"), t("example2"), t("example3")];
  const latest = turns[turns.length - 1]?.id;

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        {turns.length === 0 && <p className="text-muted">{t("intro")}</p>}
      </header>

      {turns.length === 0 && (
        <section aria-labelledby="examples" className="simple-hide flex flex-col gap-2">
          <h2 id="examples" className="eyebrow">
            {t("examplesLabel")}
          </h2>
          <ul className="flex flex-col gap-2">
            {examples.map((e) => (
              <li key={e}>
                <button type="button" onClick={() => ask(e)} className="card w-full !p-4 text-start font-bold text-teal hover:border-teal">
                  {e}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="log" aria-live="polite" aria-relevant="additions" className="flex flex-col gap-5">
        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            <p dir="auto" className="max-w-[85%] self-end rounded-2xl rounded-ee-md bg-teal px-4 py-2.5 text-white">
              <span className="sr-only">{t("you")}: </span>
              {turn.question}
            </p>
            {turn.res && (
              <AnswerCard
                question={turn.question}
                res={turn.res}
                autoRead={settings.autoRead && turn.id === latest}
                onFollowUp={ask}
              />
            )}
            {turn.error && <ErrorNote code={turn.error} onRetry={() => ask(turn.question)} />}
          </div>
        ))}
        {pending && (
          <p role="status" className="flex items-center gap-2 font-bold text-muted">
            <Loader2 aria-hidden className="size-5 animate-spin text-teal" />
            {t("thinking")}
          </p>
        )}
      </div>
      <div ref={endRef} />

      {voice && (
        <section className="card relative flex flex-col gap-2">
          <button type="button" onClick={() => setVoice(false)} className="btn btn-quiet absolute end-2 top-2 !px-2" aria-label={tc("close")}>
            <X aria-hidden className="size-5" />
          </button>
          <VoiceAssistant big />
        </section>
      )}

      <form
        className="sticky bottom-20 flex flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor="question" className="sr-only">
          {t("inputLabel")}
        </label>
        <textarea
          id="question"
          ref={inputRef}
          dir="auto"
          rows={2}
          maxLength={1000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          placeholder={t("placeholder")}
          className="field resize-none text-lg"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVoice(!voice)}
            aria-pressed={voice}
            className="btn btn-primary !size-14 !rounded-full !p-0"
            aria-label={t("speak")}
            title={t("speak")}
          >
            <Mic aria-hidden className="size-7" />
          </button>
          <Link href="/letters" className="btn btn-secondary !size-14 !rounded-full !p-0" aria-label={t("letterShortcut")} title={t("letterShortcut")}>
            <Camera aria-hidden className="size-6" />
          </Link>
          <button type="submit" className="btn btn-primary ms-auto min-h-14 px-6 text-lg" disabled={pending || input.trim().length < 2}>
            {t("send")}
            <Send aria-hidden className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
      </form>
    </main>
  );
}

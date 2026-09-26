"use client";

import { Ban, ExternalLink, HelpCircle, Loader2, Mic, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ListenButton } from "@/components/ListenButton";
import { ErrorNote, HandoffCard } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { SourceList } from "@/components/Sources";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { api, errorCode } from "@/lib/api";
import { saveDraft } from "@/lib/handoff-draft";
import { getProfileId } from "@/lib/storage";
import type { ScamResult } from "@/lib/types";

const VERDICT_STYLE = {
  likely_scam: { icon: ShieldAlert, cls: "border-danger-ink bg-danger-light text-danger-ink" },
  unsure: { icon: HelpCircle, cls: "border-amber-ink/40 bg-amber-light text-amber-ink" },
  likely_real: { icon: ShieldCheck, cls: "border-teal bg-teal-light text-teal" },
} as const;

export default function ScamCheckPage() {
  const t = useTranslations("Scam");
  const ta = useTranslations("Ask");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const { settings } = useSettings();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ScamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);

  const check = async () => {
    if (text.trim().length < 5) return;
    setPending(true);
    setError(null);
    try {
      setResult(
        await api<ScamResult>("/scam-check", {
          method: "POST",
          body: { description: text.trim(), language: locale, profile_id: getProfileId() || undefined },
        }),
      );
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setPending(false);
    }
  };

  const style = result ? VERDICT_STYLE[result.verdict] : null;

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </header>

      {!result && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <label htmlFor="scam-text" className="label">
            {t("inputLabel")}
          </label>
          <textarea
            id="scam-text"
            dir="auto"
            rows={5}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            className="field text-lg"
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary min-h-14 flex-1 text-lg" disabled={pending || text.trim().length < 5}>
              {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ShieldCheck aria-hidden className="size-6" />}
              {pending ? t("checking") : t("check")}
            </button>
            <button type="button" className="btn btn-secondary min-h-14" aria-pressed={voice} onClick={() => setVoice(!voice)}>
              <Mic aria-hidden className="size-6" />
              {ta("speak")}
            </button>
          </div>
        </form>
      )}

      {voice && !result && (
        <section className="card relative">
          <button type="button" onClick={() => setVoice(false)} className="btn btn-quiet absolute end-2 top-2 !px-2" aria-label={tc("close")}>
            <X aria-hidden className="size-5" />
          </button>
          <VoiceAssistant big />
        </section>
      )}

      {pending && (
        <p role="status" className="sr-only">
          {t("checking")}
        </p>
      )}
      {error && <ErrorNote code={error} onRetry={check} />}

      {result && style && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <div className={`card flex flex-col gap-3 border-2 ${style.cls}`}>
            <p className="flex items-center gap-2 text-xl font-bold">
              <style.icon aria-hidden className="size-7 shrink-0" />
              {result.verdict_text}
            </p>
            {result.reasons.length > 0 && (
              <>
                <h2 className="font-bold">{t("why")}</h2>
                <ul className="list-disc ps-6">
                  {result.reasons.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </>
            )}
          </div>

          {result.what_to_do.length > 0 && (
            <div className="card flex flex-col gap-2">
              <h2 className="text-lg font-bold">{t("whatToDo")}</h2>
              <ol className="list-decimal ps-6">
                {result.what_to_do.map((r) => <li key={r}>{r}</li>)}
              </ol>
            </div>
          )}

          {result.government_never.length > 0 && (
            <div className="card flex flex-col gap-2">
              <h2 className="text-lg font-bold">{t("governmentNever")}</h2>
              <ul className="flex flex-col gap-1.5">
                {result.government_never.map((r) => (
                  <li key={r} className="flex gap-2">
                    <Ban aria-hidden className="mt-1 size-4 shrink-0 text-danger-ink" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ListenButton
            text={[result.verdict_text, ...result.reasons, ...result.what_to_do].join(". ")}
            language={locale}
            autoPlay={settings.autoRead}
          />

          {result.report_url && (
            <a href={result.report_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              {t("report")}
              <ExternalLink aria-hidden className="size-5" />
              <span className="sr-only">{tc("opensNewTab")}</span>
            </a>
          )}

          <div className="card">
            <SourceList sources={result.sources} heading={tc("source")} />
          </div>

          {result.verdict !== "likely_real" && (
            <div onClickCapture={() => saveDraft({ need: text, topic: "scams", requestId: result.request_id })}>
              <HandoffCard title={ta("handoffTitle")} body={ta("handoff_not_found")} href="/help" button={ta("handoffButton")} />
            </div>
          )}

          <p className="rounded-card bg-teal-light p-4 font-bold">{t("reassurance")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setResult(null);
              setText("");
            }}
          >
            {t("another")}
          </button>
        </section>
      )}
    </main>
  );
}

"use client";

import { AlertTriangle, CalendarPlus, Camera, Check, CircleCheck, FileUp, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ListenButton } from "@/components/ListenButton";
import { ErrorNote } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getProfileId, setProfileId } from "@/lib/storage";
import type { LetterResult, Profile } from "@/lib/types";

const MAX_BYTES = 10 * 1024 * 1024;

export default function LettersPage() {
  const t = useTranslations("Letters");
  const locale = useLocale();
  const { settings } = useSettings();
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  const [result, setResult] = useState<LetterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const decode = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAdded(false);
    if (file.size > MAX_BYTES) {
      setError("file_too_large");
      return;
    }
    setState("reading");
    const form = new FormData();
    form.append("file", file);
    form.append("language", locale);
    const pid = getProfileId();
    if (pid) form.append("profile_id", pid);
    try {
      setResult(await api<LetterResult>("/letters/decode", { method: "POST", form }));
      setState("done");
    } catch (err) {
      setError(errorCode(err));
      setState("idle");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addDeadline = async () => {
    if (!result) return;
    setError(null);
    try {
      let pid = getProfileId();
      if (!pid) {
        const profile = await api<Profile>("/profile", { method: "POST", body: { preferred_language: locale } });
        pid = profile.id;
        setProfileId(pid);
      }
      await api(`/roadmap/${pid}/custom`, {
        method: "POST",
        body: {
          title: (result.short_title || result.sender || t("title")).slice(0, 140),
          due_date: result.deadline_iso || null,
          note: result.what_it_means.slice(0, 500),
        },
      });
      setAdded(true);
    } catch (err) {
      setError(errorCode(err));
    }
  };

  const reset = () => {
    setResult(null);
    setState("idle");
    setAdded(false);
  };

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </header>

      {state !== "done" && (
        <section className="flex flex-col gap-3">
          <input ref={cameraRef} id="camera" type="file" accept="image/*" capture="environment" hidden aria-label={t("takePhoto")} onChange={(e) => decode(e.target.files?.[0])} />
          <input ref={fileRef} id="file" type="file" accept="image/jpeg,image/png,image/heic,image/heif,application/pdf" hidden aria-label={t("upload")} onChange={(e) => decode(e.target.files?.[0])} />
          <button type="button" className="btn btn-primary min-h-16 text-lg" disabled={state === "reading"} onClick={() => cameraRef.current?.click()}>
            <Camera aria-hidden className="size-7" />
            {t("takePhoto")}
          </button>
          <button type="button" className="btn btn-secondary min-h-14" disabled={state === "reading"} onClick={() => fileRef.current?.click()}>
            <FileUp aria-hidden className="size-6" />
            {t("upload")}
          </button>
          <p className="text-sm text-muted">{t("fileTypes")}</p>
          <p className="flex items-start gap-2 rounded-card bg-brand-light p-4">
            <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
            {t("privacy")}
          </p>
        </section>
      )}

      {state === "reading" && (
        <p role="status" className="flex items-center gap-2 text-lg font-bold">
          <Loader2 aria-hidden className="size-6 animate-spin text-brand" />
          {t("reading")}
        </p>
      )}
      {error && <ErrorNote code={error} />}

      {result && state === "done" && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <div className="card flex flex-col gap-1">
            <p className="eyebrow">{t("from")}</p>
            <p className="text-xl font-bold" dir="auto">{result.sender || "—"}</p>
            <p className="text-sm text-muted">{t(`confidence_${result.sender_confidence}`)}</p>
          </div>

          {result.looks_suspicious && (
            <div role="alert" className="card flex flex-col gap-2 border-danger-ink/40 bg-danger-light text-danger-ink">
              <p className="flex items-center gap-2 font-bold">
                <ShieldAlert aria-hidden className="size-6" />
                {t("suspicious")}
              </p>
              <ul className="list-disc ps-6">
                {result.suspicious_reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <Link href="/scam-check" className="btn btn-primary self-start !bg-danger-ink">
                {t("checkScam")}
              </Link>
            </div>
          )}

          <div className={`card flex flex-col gap-2 ${result.action_needed ? "border-amber-ink/30 bg-amber-light text-amber-ink" : ""}`}>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {result.action_needed ? <AlertTriangle aria-hidden className="size-6" /> : <CircleCheck aria-hidden className="size-6 text-brand" />}
              {t("needAction")}
            </h2>
            <p className="font-bold">{result.action_needed ? t("actionYes") : t("actionNo")}</p>
            {result.deadline && <p className="text-lg font-bold">{t("deadline", { deadline: result.deadline })}</p>}
            {result.amount_owed && <p>{t("amount", { amount: result.amount_owed })}</p>}
            {result.action_needed && (
              added ? (
                <p role="status" className="flex items-center gap-2 font-bold">
                  <Check aria-hidden className="size-5" />
                  {t("deadlineAdded")}{" "}
                  <Link href="/roadmap" className="underline">→</Link>
                </p>
              ) : (
                <button type="button" onClick={addDeadline} className="btn btn-primary self-start">
                  <CalendarPlus aria-hidden className="size-5" />
                  {t("addDeadline")}
                </button>
              )
            )}
          </div>

          <div className="card flex flex-col gap-3" dir="auto">
            <h2 className="text-lg font-bold">{t("whatItSays")}</h2>
            <p>{result.what_it_means}</p>
            {result.steps.length > 0 && (
              <>
                <h3 className="font-bold">{t("steps")}</h3>
                <ol className="flex list-decimal flex-col gap-1.5 ps-6">
                  {result.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </>
            )}
            <ListenButton
              text={[result.sender, result.what_it_means, result.deadline ? t("deadline", { deadline: result.deadline }) : "", ...result.steps].filter(Boolean).join(". ")}
              language={locale}
              autoPlay={settings.autoRead}
            />
            <p className="text-sm text-muted">{result.disclaimer}</p>
          </div>

          <p className="simple-hide text-sm text-muted">{t("sampleNote")}</p>
          <button type="button" onClick={reset} className="btn btn-secondary">
            {t("another")}
          </button>
        </section>
      )}
    </main>
  );
}

"use client";

// End of session (docs/REDESIGN.md section 10): five faces (tap or say it), an optional "what is missing?" answer
// by voice or text, then a reminder that the checklist and ID stay on this phone.

import { ArrowLeft, Loader2, Mic, Send, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { languageInfo } from "@/config/languages";
import { canRecord, useRecorder } from "@/hooks/useRecorder";
import { unlockAudio } from "@/hooks/useSpeaker";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { sessionId } from "@/lib/events";
import { getProfileId } from "@/lib/storage";
import type { OnboardingAnswer } from "@/lib/types";

const FACES = [
  { score: 1, mouth: "M70 138q30 -22 60 0", color: "#8e2a1d" },
  { score: 2, mouth: "M72 134q28 -10 56 0", color: "#b0582a" },
  { score: 3, mouth: "M72 130h56", color: "#6b6b3a" },
  { score: 4, mouth: "M72 126q28 12 56 0", color: "#2f7a5d" },
  { score: 5, mouth: "M68 122q32 30 64 0", color: "#0e5e57" },
];

function Face({ mouth, color }: { mouth: string; color: string }) {
  return (
    <svg viewBox="0 0 200 200" className="size-14" aria-hidden>
      <circle cx="100" cy="100" r="90" fill={color} />
      <circle cx="72" cy="84" r="11" fill="#fff" />
      <circle cx="128" cy="84" r="11" fill="#fff" />
      <path d={mouth} fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

export function EndSession() {
  const t = useTranslations("End");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const voice = languageInfo(locale).stt;
  const recorder = useRecorder();
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<"face" | "missing" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [mic, setMic] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the ID and microphone are only known after hydration */
    setId(getProfileId());
    setMic(canRecord());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const sayFace = async () => {
    unlockAudio();
    setError(null);
    setBusy("face");
    const rec = await recorder.record();
    if (!rec.audio) return setBusy(null);
    const form = new FormData();
    form.append("question_key", "satisfaction");
    form.append("language", locale);
    form.append("audio", rec.audio, "answer.webm");
    try {
      const r = await api<OnboardingAnswer>("/onboarding/answer", { method: "POST", form });
      if (r.understood && typeof r.value.satisfaction === "number") setScore(r.value.satisfaction);
      else setError(t("notUnderstood"));
    } catch (err) {
      setError(te(te.has(errorCode(err)) ? errorCode(err) : "stt_failed"));
    }
    setBusy(null);
  };

  const sayMissing = async () => {
    unlockAudio();
    setBusy("missing");
    const rec = await recorder.record();
    setAudio(rec.audio);
    setBusy(null);
  };

  const send = async () => {
    setBusy("send");
    setError(null);
    const form = new FormData();
    form.append("session_id", sessionId());
    form.append("language", locale);
    if (id) form.append("profile_id", id);
    if (score) form.append("satisfaction", String(score));
    if (audio) form.append("audio", audio, "answer.webm");
    else if (text.trim()) form.append("missing_features", text.trim());
    try {
      if (score || audio || text.trim()) await api("/survey", { method: "POST", form });
      setSent(true);
    } catch (err) {
      setError(te(te.has(errorCode(err)) ? errorCode(err) : "internal_error"));
    }
    setBusy(null);
  };

  if (sent) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-5 px-5 py-10 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("thanks")}</h1>
        <p className="text-lg">{t("saved")}</p>
        {id && (
          <p lang="en" dir="ltr" className="font-mono text-2xl font-bold tracking-wider text-teal">
            {id}
          </p>
        )}
        <Link href="/home" className="btn btn-primary min-h-14 w-full text-lg">
          {t("back")}
        </Link>
      </main>
    );
  }

  const recording = recorder.state === "recording";
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <section aria-labelledby="q1" className="flex flex-col gap-3">
        <h1 id="q1" className="font-display text-3xl font-semibold">
          {t("helped")}
        </h1>
        <div role="radiogroup" aria-labelledby="q1" className="flex justify-between gap-1" dir="ltr">
          {FACES.map((f) => (
            <button
              key={f.score}
              type="button"
              role="radio"
              aria-checked={score === f.score}
              aria-label={t(`face${f.score}`)}
              onClick={() => setScore(f.score)}
              className={`flex flex-col items-center gap-1 rounded-card border-2 p-1.5 ${
                score === f.score ? "border-teal bg-teal-light" : "border-transparent"
              }`}
            >
              <Face mouth={f.mouth} color={f.color} />
              <span className="text-xs font-bold">{t(`face${f.score}`)}</span>
            </button>
          ))}
        </div>
        {voice && mic && (
          <button type="button" className="btn btn-secondary self-start" onClick={busy === "face" ? recorder.stop : () => void sayFace()}>
            {busy === "face" ? <Square aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
            {busy === "face" ? t("stop") : t("sayIt")}
          </button>
        )}
      </section>

      <section aria-labelledby="q2" className="flex flex-col gap-3">
        <h2 id="q2" className="text-xl font-bold">
          {t("missing")}
        </h2>
        <p className="text-muted">{t("missingHint")}</p>
        <label htmlFor="missing-text" className="sr-only">
          {t("missing")}
        </label>
        <textarea
          id="missing-text"
          className="field min-h-28"
          dir="auto"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={Boolean(audio)}
        />
        {voice && mic && (
          <button
            type="button"
            className="btn btn-secondary self-start"
            onClick={busy === "missing" ? recorder.stop : () => void sayMissing()}
            disabled={recording && busy !== "missing"}
          >
            {busy === "missing" ? <Square aria-hidden className="size-5" /> : <Mic aria-hidden className="size-5" />}
            {busy === "missing" ? t("stop") : audio ? t("recorded") : t("sayIt")}
          </button>
        )}
      </section>

      {error && (
        <p role="alert" className="card bg-amber-light text-amber-ink">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={() => void send()} disabled={busy !== null}>
        {busy === "send" ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5 rtl:-scale-x-100" />}
        {t("send")}
      </button>
    </main>
  );
}

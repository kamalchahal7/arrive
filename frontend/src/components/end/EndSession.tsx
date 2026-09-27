"use client";

// End of session: five faces (tap or say it), an optional "what is missing?" answer (typed or spoken; speech is
// turned into text in the box), then a reminder that the checklist and ID stay on this phone.

import { ConversationProvider } from "@elevenlabs/react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useBi } from "@/components/Bi";
import { type SpeakProblem, SpeakPanel } from "@/components/SpeakPanel";
import { canListen, useAbaListener } from "@/hooks/useAbaListener";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { sessionId } from "@/lib/events";
import { getProfileId } from "@/lib/storage";
import { extractScore } from "@/lib/understand";

const FACES = [
  { score: 1, mouth: "M70 138q30 -22 60 0", color: "#8e2a1d" },
  { score: 2, mouth: "M72 134q28 -10 56 0", color: "#b0582a" },
  { score: 3, mouth: "M72 130h56", color: "#6b6b3a" },
  { score: 4, mouth: "M72 126q28 12 56 0", color: "#3f7a4f" },
  { score: 5, mouth: "M68 122q32 30 64 0", color: "#2f6343" },
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
  return (
    <ConversationProvider>
      <Survey />
    </ConversationProvider>
  );
}

function Survey() {
  const b = useBi("End");
  const t = useTranslations("End");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const listener = useAbaListener(locale);
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [asking, setAsking] = useState<"face" | "missing" | null>(null);
  const [problem, setProblem] = useState<SpeakProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [mic, setMic] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- the ID and microphone are only known after hydration */
    setId(getProfileId());
    setMic(canListen());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const say = async (what: "face" | "missing") => {
    setError(null);
    setProblem(null);
    setAsking(what);
    const r = await listener.listen();
    if (r.text === null) {
      if (r.reason === "denied") setProblem("micDenied");
      else if (r.reason === "silent") setProblem("notHeard");
      else if (r.reason === "failed") setProblem("failed");
      return;
    }
    if (what === "missing") return setText((prev) => (prev ? `${prev} ${r.text}` : r.text).slice(0, 1000));
    const s = extractScore(r.text);
    if (s) setScore(s);
    else setError(t("notUnderstood"));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("session_id", sessionId());
    form.append("language", locale);
    if (id) form.append("profile_id", id);
    if (score) form.append("satisfaction", String(score));
    if (text.trim()) form.append("missing_features", text.trim());
    try {
      if (score || text.trim()) await api("/survey", { method: "POST", form });
      setSent(true);
    } catch (err) {
      setError(te(te.has(errorCode(err)) ? errorCode(err) : "internal_error"));
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-5 px-5 py-10 text-center">
        <h1 className="font-display text-3xl font-semibold">{b("thanks")}</h1>
        <p className="text-lg">{b("saved")}</p>
        {id && (
          <p lang="en" dir="ltr" className="font-mono text-2xl font-bold tracking-wider text-brand">
            {id}
          </p>
        )}
        <Link href="/home" className="btn btn-primary min-h-14 w-full text-lg">
          {b("back")}
        </Link>
      </main>
    );
  }

  const panel = (what: "face" | "missing") =>
    mic && (
      <SpeakPanel
        compact
        state={asking === what ? listener.state : "idle"}
        onSpeak={() => void say(what)}
        onCancel={listener.cancel}
        getLevel={listener.getLevel}
        problem={asking === what ? problem : null}
      />
    );

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {b("back")}
      </Link>
      <section aria-labelledby="q1" className="flex flex-col gap-3">
        <h1 id="q1" className="font-display text-3xl font-semibold">
          {b("helped")}
        </h1>
        <div role="radiogroup" aria-labelledby="q1" className="flex justify-between gap-1" dir="ltr">
          {FACES.map((f) => (
            <button
              key={f.score}
              type="button"
              role="radio"
              aria-checked={score === f.score}
              aria-label={b.text(`face${f.score}`)}
              onClick={() => setScore(f.score)}
              className={`flex flex-col items-center gap-1 rounded-card border-2 p-1.5 ${
                score === f.score ? "border-brand bg-brand-light" : "border-transparent"
              }`}
            >
              <Face mouth={f.mouth} color={f.color} />
              <span className="text-xs font-bold">{b.local(`face${f.score}`)}</span>
            </button>
          ))}
        </div>
        {panel("face")}
      </section>

      <section aria-labelledby="q2" className="flex flex-col gap-3">
        <h2 id="q2" className="text-xl font-bold">
          {b("missing")}
        </h2>
        <p className="text-muted">{b.local("missingHint")}</p>
        <label htmlFor="missing-text" className="sr-only">
          {b.text("missing")}
        </label>
        <textarea
          id="missing-text"
          className="field min-h-28"
          dir="auto"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {panel("missing")}
      </section>

      {error && (
        <p role="alert" className="card bg-amber-light text-amber-ink">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={() => void send()} disabled={busy || listener.state !== "idle"}>
        {busy ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5 rtl:-scale-x-100" />}
        {b("send")}
      </button>
    </main>
  );
}

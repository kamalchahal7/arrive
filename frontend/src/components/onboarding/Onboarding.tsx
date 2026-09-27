"use client";

// Voice onboarding: Aba greets the person (spoken automatically), then asks seven questions, one per screen. Each
// question can be answered by speaking (tap to speak; the answer is understood and filled in automatically) or by
// tapping/typing. Then a summary ("Is this right?") and the readable Arrive ID.

import { ConversationProvider } from "@elevenlabs/react";
import { ArrowLeft, ArrowRight, Baby, Check, Loader2, RotateCcw, User, UserRound, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Avatar, type AvatarState } from "@/components/Avatar";
import { useBi } from "@/components/Bi";
import { ErrorNote } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { type SpeakProblem, SpeakPanel } from "@/components/SpeakPanel";
import { countryName, languageInfo } from "@/config/languages";
import { canListen, useAbaListener } from "@/hooks/useAbaListener";
import { prefetchSpeech, unlockAudio, useSpeaker } from "@/hooks/useSpeaker";
import { useRouter } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { cacheProfile, getDraft, getProfileId, saveDraft, setProfileId } from "@/lib/storage";
import { type Gender, type OnboardingQuestion, type Profile, profileRef } from "@/lib/types";
import { extractCity, extractCountry, extractGender, extractHousehold, extractName, isSenior, yesNo } from "@/lib/understand";
import { ChoiceCards, Stepper, TextAnswer } from "./AnswerControls";
import { type Draft, EMPTY_DRAFT, isAnswered, markAnswered, QUESTIONS, REQUIRED, toProfileInput, totals } from "./draft";

type Phase = "intro" | "question" | "summary" | "done" | "restore";
type Saved = { draft: Draft; phase: Phase; index: number };

const KEY: Record<OnboardingQuestion, string> = {
  first_name: "firstName",
  city: "city",
  country_of_origin: "country",
  gender: "gender",
  self_age: "selfAge",
  household: "household",
  disability: "disability",
};
const GENDERS: readonly Gender[] = ["man", "woman", "another", "prefer_not_to_say"];
const HOUSEHOLD_GROUPS = [
  { id: "adults", icon: UserRound },
  { id: "seniors", icon: User },
  { id: "children_0_5", icon: Baby },
  { id: "children_6_17", icon: Users },
] as const;
const AUTO_NEXT_MS = 1400; // time to see a spoken answer filled in before the next question

// ARV-XXXX-XXXX-XXXX in Crockford base32, read the way backend/app/services/public_id.py does.
function normalizeId(value: string): string | null {
  let raw = value.replace(/[\s\-_.]/g, "").toUpperCase();
  if (raw.startsWith("ARV")) raw = raw.slice(3);
  raw = raw.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(raw)) return null;
  return `ARV-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function Onboarding() {
  return (
    <ConversationProvider>
      <Flow />
    </ConversationProvider>
  );
}

function Flow() {
  const t = useTranslations("Onboarding");
  const b = useBi("Onboarding");
  const bc = useBi("Common");
  const ta = useTranslations("Avatar");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const router = useRouter();
  const info = languageInfo(locale);
  const { settings, update } = useSettings();

  const [phase, setPhase] = useState<Phase>("intro");
  const [autoIntro, setAutoIntro] = useState(true);
  const [introStuck, setIntroStuck] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [index, setIndex] = useState(0);
  const [toSummary, setToSummary] = useState(false);
  const [heard, setHeard] = useState<{ text: string; ok: boolean } | null>(null);
  const [problem, setProblem] = useState<SpeakProblem | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [created, setCreated] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const speaker = useSpeaker(locale, info.tts);
  const listener = useAbaListener(locale);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const autoNext = useRef<number | null>(null);
  const listenRef = useRef<() => void>(() => {});

  const q = QUESTIONS[Math.min(index, QUESTIONS.length - 1)];
  const k = KEY[q];
  const canSpeak = info.stt && micReady;

  const clearAutoNext = () => {
    if (autoNext.current !== null) window.clearTimeout(autoNext.current);
    autoNext.current = null;
  };

  // Restore answers after a reload or a language switch (this tab only).
  useEffect(() => {
    const saved = getDraft<Saved>();
    /* eslint-disable react-hooks/set-state-in-effect -- saved answers and the microphone are only readable after hydration */
    if (saved?.draft && QUESTIONS.includes(QUESTIONS[saved.index] ?? "first_name")) {
      const d = { ...EMPTY_DRAFT, ...saved.draft };
      setDraft(d);
      setPhase(saved.phase === "done" ? "intro" : saved.phase);
      setIndex(Math.min(saved.index || 0, QUESTIONS.length - 1));
      setNameInput(d.first_name ?? "");
      setCityInput(d.city_name ?? "");
      setCountryInput(d.country_text ?? "");
      if (saved.phase !== "intro") setAutoIntro(false);
    }
    setMicReady(canListen());
    // Scanned from an older ID card QR code: /onboarding#open=ARV-...
    const opened = /^#open=([A-Za-z0-9-]{12,24})$/.exec(window.location.hash)?.[1];
    if (opened) {
      setRestoreInput(opened);
      setPhase("restore");
      setAutoIntro(false);
      history.replaceState(null, "", window.location.pathname);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (phase !== "done") saveDraft({ draft, phase, index } satisfies Saved);
  }, [draft, phase, index]);

  // ---------- Aba speaks ----------

  const spokenQuestion = (question: OnboardingQuestion, d: Draft): string => {
    const key = KEY[question];
    const name = d.first_name;
    let text = t(`${key}.question`);
    if (question === "city" && name) text = `${t("niceToMeet", { name })} ${text}`;
    else if (name && question !== "first_name") text = t("addressed", { name, question: text });
    if (question === "gender") text += ` ${t("gender.spoken")}`;
    if (question === "household") text += ` ${t("household.hint")} ${t("household.spoken")}`;
    return text;
  };

  // The greeting starts by itself after the language is chosen, then the first question follows.
  useEffect(() => {
    if (phase !== "intro" || !autoIntro) return;
    let active = true;
    void (async () => {
      const finished = await speaker.speak([t("introTitle"), t("introBody"), t("introHow")].join(" "));
      if (!active) return;
      if (finished) {
        setAutoIntro(false);
        setPhase("question");
      } else {
        setIntroStuck(true); // read-aloud blocked or unavailable: show a Start button
      }
    })();
    prefetchSpeech(spokenQuestion(QUESTIONS[0], draft), locale);
    return () => {
      active = false;
      speaker.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak once when the intro is shown
  }, [phase, autoIntro]);

  useEffect(() => {
    if (phase !== "question") return;
    if (moved.current) heading.current?.focus();
    moved.current = true;
    let active = true;
    void (async () => {
      const finished = await speaker.speak(spokenQuestion(q, draft));
      if (active && finished && settings.autoListen && canSpeak) listenRef.current();
    })();
    const next = QUESTIONS[index + 1];
    if (next && speaker.available) prefetchSpeech(spokenQuestion(next, draft), locale);
    return () => {
      active = false;
      speaker.stop();
      listener.cancel();
      clearAutoNext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak once per question shown
  }, [phase, q]);

  // ---------- moving between questions ----------

  const goNext = (next: Draft) => {
    clearAutoNext();
    setHeard(null);
    setProblem(null);
    setError(null);
    const open = QUESTIONS.findIndex((question) => REQUIRED.includes(question) && !isAnswered(next, question));
    if (toSummary) {
      if (open >= 0 && QUESTIONS[open] !== q) return setIndex(open);
      setToSummary(false);
      return setPhase("summary");
    }
    const pos = QUESTIONS.indexOf(q);
    if (pos + 1 >= QUESTIONS.length) setPhase("summary");
    else setIndex(pos + 1);
  };

  const answer = (next: Draft) => {
    const done = markAnswered(next, q);
    setDraft(done);
    goNext(done);
  };

  const back = () => {
    speaker.stop();
    listener.cancel();
    clearAutoNext();
    setHeard(null);
    setProblem(null);
    if (toSummary) {
      setToSummary(false);
      setPhase("summary");
    } else if (index === 0) {
      setPhase("intro");
    } else {
      setIndex(index - 1);
    }
  };

  // ---------- answering by voice ----------

  /** Understand what was said for the current question, fill it in, and move on. */
  const understood = (text: string) => {
    let next: Draft | null = null;
    switch (q) {
      case "first_name": {
        const name = extractName(text);
        if (name) {
          setNameInput(name);
          next = { ...draft, first_name: name };
        }
        break;
      }
      case "city": {
        const city = extractCity(text);
        if (city) {
          setCityInput(city);
          next = { ...draft, city_name: city };
        }
        break;
      }
      case "country_of_origin": {
        const c = extractCountry(text, locale);
        if (c?.name) {
          setCountryInput(c.name);
          next = { ...draft, country_of_origin: c.code, country_text: c.name };
        }
        break;
      }
      case "gender": {
        const g = extractGender(text);
        if (g) next = { ...draft, gender: g };
        break;
      }
      case "self_age": {
        const s = isSenior(text);
        if (s !== null) next = { ...draft, self_age_group: s ? "senior" : "adult" };
        break;
      }
      case "household": {
        const h = extractHousehold(text);
        if (h) next = { ...draft, others: h };
        break;
      }
      case "disability": {
        const y = yesNo(text);
        if (y !== null) next = { ...draft, disability: y };
        break;
      }
    }
    setHeard({ text, ok: next !== null });
    if (!next) return setProblem("notHeard");
    const filled = markAnswered(next, q);
    setDraft(filled);
    // The steppers stay on screen so the counts can be checked; every other answer moves on by itself.
    if (q !== "household") autoNext.current = window.setTimeout(() => goNext(filled), AUTO_NEXT_MS);
  };

  const listen = async () => {
    unlockAudio();
    speaker.stop();
    clearAutoNext();
    setHeard(null);
    setProblem(null);
    const r = await listener.listen();
    if (r.text !== null) return understood(r.text);
    if (r.reason === "denied") setProblem("micDenied");
    else if (r.reason === "silent") setProblem("notHeard");
    else if (r.reason === "failed") setProblem("failed");
  };
  useEffect(() => {
    listenRef.current = () => void listen();
  });

  // ---------- creating the profile ----------

  const create = async () => {
    setSaving(true);
    setError(null);
    const body = toProfileInput(draft, locale);
    try {
      const existing = getProfileId();
      let profile: Profile;
      try {
        profile = existing
          ? await api<Profile>(`/profile/${existing}`, { method: "PATCH", body })
          : await api<Profile>("/profile", { method: "POST", body });
      } catch (err) {
        if (!existing || errorCode(err) !== "profile_not_found") throw err;
        profile = await api<Profile>("/profile", { method: "POST", body });
      }
      setProfileId(profileRef(profile));
      // The first name and the country as said stay on this phone even if the server cannot store them.
      cacheProfile({
        ...profile,
        first_name: profile.first_name ?? body.first_name ?? null,
        city_name: draft.city_name,
        country_text: draft.country_text,
      });
      saveDraft(null);
      setCreated(profile);
      setPhase("done");
      void speaker.speak(draft.first_name ? t("addressed", { name: draft.first_name, question: t("done.title") }) : t("done.title"));
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    setRestoreError(null);
    const id = normalizeId(restoreInput);
    if (!id) return setRestoreError(t("restore.invalid"));
    setSaving(true);
    try {
      const profile = await api<Profile>(`/profile/${id}`);
      setProfileId(profileRef(profile));
      cacheProfile(profile);
      saveDraft(null);
      router.push("/home");
    } catch (err) {
      const code = errorCode(err);
      setRestoreError(code === "profile_not_found" ? t("restore.notFound") : te(te.has(code) ? code : "internal_error"));
      setSaving(false);
    }
  };

  // ---------- avatar ----------

  const avatarState: AvatarState =
    listener.state === "listening"
      ? "listening"
      : listener.state === "connecting" || speaker.state === "loading"
        ? "thinking"
        : speaker.state === "speaking"
          ? "speaking"
          : "idle";
  const getLevel = listener.state === "listening" ? listener.getLevel : speaker.getLevel;

  // ---------- screens ----------

  if (phase === "intro") {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
        <Avatar state={avatarState} label={ta(avatarState)} getLevel={getLevel} />
        <h1 className="font-display text-3xl font-semibold">{b("introTitle")}</h1>
        <div className="flex flex-col gap-3 text-lg">
          <p>{b("introBody")}</p>
          <p className="font-bold">{b("introHow")}</p>
        </div>
        {introStuck && (
          <button
            type="button"
            className="btn btn-primary min-h-14 w-full text-lg"
            onClick={() => {
              unlockAudio();
              setAutoIntro(false);
              setPhase("question");
            }}
          >
            {b("start")}
            <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
          </button>
        )}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            speaker.stop();
            setAutoIntro(false);
            setPhase("restore");
          }}
        >
          {b("haveId")}
        </button>
      </main>
    );
  }

  if (phase === "restore") {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-8">
        <button type="button" className="btn btn-quiet self-start !px-0" onClick={() => setPhase("intro")}>
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {b("back")}
        </button>
        <h1 className="font-display text-3xl font-semibold">{b("restore.title")}</h1>
        <p className="text-lg">{b("restore.intro")}</p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <label htmlFor="restore-id" className="label text-lg">
            {b("restore.label")}
          </label>
          <input
            id="restore-id"
            className="field min-h-14 font-mono text-2xl tracking-widest uppercase"
            lang="en"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ARV-XXXX-XXXX-XXXX"
            value={restoreInput}
            onChange={(e) => setRestoreInput(e.target.value)}
            aria-invalid={Boolean(restoreError)}
            aria-describedby={restoreError ? "restore-error" : undefined}
            maxLength={24}
          />
          {restoreError && (
            <p id="restore-error" role="alert" className="font-bold text-danger-ink">
              {restoreError}
            </p>
          )}
          <button type="submit" className="btn btn-primary min-h-14 text-lg" disabled={saving}>
            {saving && <Loader2 aria-hidden className="size-5 animate-spin" />}
            {b("restore.open")}
          </button>
        </form>
        <button type="button" className="btn btn-quiet self-start" onClick={() => setPhase("question")}>
          {b("restore.startOver")}
        </button>
      </main>
    );
  }

  if (phase === "done" && created) {
    const id = profileRef(created);
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
        <Avatar state={avatarState} label={ta(avatarState)} getLevel={getLevel} />
        <h1 className="font-display text-3xl font-semibold">{b("done.title")}</h1>
        <section aria-labelledby="id-label" className="card flex w-full flex-col items-center gap-2">
          <h2 id="id-label" className="eyebrow">
            {b("done.idLabel")}
          </h2>
          <p lang="en" dir="ltr" className="font-mono text-3xl font-bold tracking-wider text-brand break-all">
            {id}
          </p>
        </section>
        <p className="text-lg">{b("done.idNote")}</p>
        <button type="button" className="btn btn-primary min-h-14 w-full text-lg" onClick={() => router.push("/home")}>
          {b("done.go")}
          <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
        </button>
      </main>
    );
  }

  if (phase === "summary") return renderSummary();

  // ---------- one question ----------

  const optional = !REQUIRED.includes(q);
  const position = QUESTIONS.indexOf(q) + 1;
  const total = QUESTIONS.length;

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-quiet !px-0" onClick={back}>
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {b("back")}
        </button>
        <p className="eyebrow">{b("progress", { current: position, total })}</p>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={b.text("progress", { current: position, total })}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
      >
        <div className="h-full rounded-full bg-brand" style={{ inlineSize: `${(position / total) * 100}%` }} />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={avatarState} label={ta(avatarState)} getLevel={getLevel} size={120} />
        <h1 ref={heading} tabIndex={-1} className="font-display text-2xl leading-tight font-semibold">
          {b(`${k}.question`)}
        </h1>
        {q === "household" && <p className="text-muted">{b("household.hint")}</p>}
        {speaker.available && (
          <button
            type="button"
            className="btn btn-secondary !min-h-11"
            onClick={() => {
              unlockAudio();
              listener.cancel();
              void speaker.speak(spokenQuestion(q, draft));
            }}
          >
            <RotateCcw aria-hidden className="size-5" />
            {b("repeat")}
          </button>
        )}
      </div>

      {canSpeak && (
        <SpeakPanel
          state={listener.state}
          onSpeak={() => void listen()}
          onCancel={listener.cancel}
          getLevel={listener.getLevel}
          heard={heard}
          problem={problem}
        />
      )}

      <section aria-labelledby="tap-title" className="flex flex-col gap-3">
        <h2 id="tap-title" className="eyebrow">
          {q === "first_name" || q === "city" || q === "country_of_origin" ? b("orType") : b("orTap")}
        </h2>
        {renderTapAnswer()}
      </section>

      {optional && (
        <button type="button" className="btn btn-quiet self-center" onClick={() => answer(draft)}>
          {b("skip")}
        </button>
      )}

      {canSpeak && (
        <label className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 text-start text-sm">
          <span className="font-bold">{b("autoListen")}</span>
          <input
            type="checkbox"
            className="size-6 accent-brand"
            checked={settings.autoListen}
            onChange={(e) => update({ autoListen: e.target.checked })}
          />
        </label>
      )}
    </main>
  );

  // ---------- pieces: plain render functions (not components), so inputs keep focus between renders ----------

  function textQuestion(label: string, value: string, set: (v: string) => void, submit: () => void, autoComplete: string, max: number) {
    return (
      <>
        <TextAnswer label={b(label)} value={value} onChange={set} onSubmit={submit} autoComplete={autoComplete} maxLength={max} />
        {nextButton(submit)}
      </>
    );
  }

  function renderTapAnswer() {
    switch (q) {
      case "first_name":
        return textQuestion("firstName.label", nameInput, setNameInput, () => answer({ ...draft, first_name: nameInput.trim() || null }), "given-name", 40);
      case "city":
        return textQuestion("city.label", cityInput, setCityInput, () => answer({ ...draft, city_name: cityInput.trim() || null }), "address-level2", 80);
      case "country_of_origin":
        return textQuestion(
          "country.label",
          countryInput,
          setCountryInput,
          () => {
            const c = countryInput.trim() ? extractCountry(countryInput, locale) : null;
            answer({ ...draft, country_of_origin: c?.code ?? null, country_text: countryInput.trim() || null });
          },
          "country-name",
          60,
        );
      case "gender":
        return (
          <ChoiceCards
            choices={GENDERS.map((g) => ({ id: g, label: b(`gender.${g}`) }))}
            value={draft.gender}
            onChoose={(id) => answer({ ...draft, gender: id as Gender })}
          />
        );
      case "self_age":
        return (
          <ChoiceCards
            choices={[
              { id: "senior", label: bc("yes"), icon: User },
              { id: "adult", label: bc("no"), icon: UserRound },
            ]}
            value={draft.self_age_group}
            onChoose={(id) => answer({ ...draft, self_age_group: id as Draft["self_age_group"] })}
          />
        );
      case "household": {
        const set = (group: keyof Draft["others"], n: number) => setDraft({ ...draft, others: { ...draft.others, [group]: n } });
        return (
          <>
            {HOUSEHOLD_GROUPS.map(({ id, icon }) => (
              <Stepper
                key={id}
                label={b(`household.${id}`)}
                icon={icon}
                value={draft.others[id]}
                onChange={(n) => set(id, n)}
                fewerLabel={t("household.fewer", { group: t(`household.${id}`) })}
                moreLabel={t("household.more", { group: t(`household.${id}`) })}
              />
            ))}
            {nextButton(() => answer(draft))}
            <button
              type="button"
              className="btn btn-secondary min-h-14 text-lg"
              onClick={() => answer({ ...draft, others: { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 } })}
            >
              <User aria-hidden className="size-5" />
              {b("household.alone")}
            </button>
          </>
        );
      }
      case "disability":
        return (
          <ChoiceCards
            choices={[
              { id: "yes", label: bc("yes") },
              { id: "no", label: bc("no") },
            ]}
            value={draft.disability === null ? null : draft.disability ? "yes" : "no"}
            onChoose={(id) => answer({ ...draft, disability: id === "yes" })}
          />
        );
    }
  }

  function nextButton(onClick: () => void) {
    return (
      <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={onClick}>
        {b("next")}
        <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
      </button>
    );
  }

  function renderSummary() {
    const tot = totals(draft);
    const kids = tot.children_0_5 + tot.children_6_17;
    const household = (
      <span className="flex flex-col">
        {tot.adults > 0 && b("summary.adults", { count: tot.adults })}
        {tot.seniors > 0 && b("summary.seniors", { count: tot.seniors })}
        {kids > 0 && b("summary.children", { count: kids })}
      </span>
    );
    const yesNoText = (v: boolean | null) => (v === null ? bc("notGiven") : v ? bc("yes") : bc("no"));
    const country = draft.country_text || (draft.country_of_origin ? countryName(draft.country_of_origin, locale) : null);
    const rows: { q: OnboardingQuestion; label: string; value: React.ReactNode }[] = [
      { q: "first_name", label: "firstName.label", value: draft.first_name || bc("notGiven") },
      { q: "city", label: "city.label", value: draft.city_name || bc("notGiven") },
      { q: "country_of_origin", label: "country.label", value: country || bc("notGiven") },
      { q: "gender", label: "gender.label", value: draft.gender ? b(`gender.${draft.gender}`) : bc("notGiven") },
      { q: "self_age", label: "selfAge.label", value: yesNoText(draft.self_age_group === null ? null : draft.self_age_group === "senior") },
      { q: "household", label: "household.label", value: household },
      { q: "disability", label: "disability.label", value: yesNoText(draft.disability) },
    ];
    const ready = REQUIRED.every((r) => isAnswered(draft, r));
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
        <button
          type="button"
          className="btn btn-quiet self-start !px-0"
          onClick={() => {
            setIndex(QUESTIONS.length - 1);
            setPhase("question");
          }}
        >
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {b("back")}
        </button>
        <div className="flex items-center gap-4">
          <Avatar state="idle" label={ta("idle")} size={88} bare />
          <div>
            <h1 className="font-display text-3xl font-semibold">{b("summary.title")}</h1>
            <p className="text-muted">{b("summary.intro")}</p>
          </div>
        </div>
        <dl className="card flex flex-col divide-y divide-line !p-0">
          {rows.map((row) => (
            <div key={row.q} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <dt className="text-sm font-bold text-muted">{b(row.label)}</dt>
                <dd className="text-lg font-bold break-words" dir="auto">
                  {row.value}
                </dd>
              </div>
              <button
                type="button"
                className="btn btn-secondary !min-h-11 shrink-0"
                aria-label={`${b.text("summary.change")}: ${b.text(row.label)}`}
                onClick={() => {
                  setToSummary(true);
                  setIndex(QUESTIONS.indexOf(row.q));
                  setPhase("question");
                }}
              >
                {b("summary.change")}
              </button>
            </div>
          ))}
        </dl>
        <div className="card flex items-start justify-between gap-4">
          <label htmlFor="consent" className="flex flex-col gap-1">
            <span className="text-lg font-bold">{b("summary.consentTitle")}</span>
            <span className="text-muted">{b.local("summary.consentBody")}</span>
          </label>
          <button
            id="consent"
            type="button"
            role="switch"
            aria-checked={draft.analytics_consent}
            onClick={() => setDraft({ ...draft, analytics_consent: !draft.analytics_consent })}
            className={`relative mt-1 inline-flex h-9 w-16 shrink-0 items-center rounded-full border-2 ${
              draft.analytics_consent ? "border-brand bg-brand" : "border-muted bg-surface"
            }`}
          >
            <span className={`absolute size-6 rounded-full ${draft.analytics_consent ? "end-1 bg-white" : "start-1 bg-muted"}`} />
          </button>
        </div>
        {error && <ErrorNote code={error} onRetry={() => void create()} />}
        <button type="button" className="btn btn-primary min-h-16 text-xl" onClick={() => void create()} disabled={saving || !ready}>
          {saving ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Check aria-hidden className="size-6" />}
          {saving ? b("summary.creating") : b("summary.create")}
        </button>
      </main>
    );
  }
}

"use client";

// Voice onboarding (docs/REDESIGN.md section 4): intro, one question per screen (spoken by the avatar, answered by
// voice or by tapping), a summary with analytics consent, then the readable profile ID.

import {
  ArrowLeft, ArrowRight, Baby, Building2, Check, Globe2, Keyboard, Loader2, MapPin, Mic, RotateCcw,
  Square, User, UserRound, Users, Volume2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, type AvatarState, useReducedMotion } from "@/components/Avatar";
import { ErrorNote } from "@/components/Notices";
import { useSettings } from "@/components/SettingsProvider";
import { ALL_COUNTRIES, COMMON_COUNTRIES } from "@/config/countries";
import { OTHER_LANGUAGES, countryName, languageInfo, languageName } from "@/config/languages";
import { canRecord, useRecorder } from "@/hooks/useRecorder";
import { prefetchSpeech, unlockAudio, useSpeaker } from "@/hooks/useSpeaker";
import { useRouter } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { cacheProfile, getDraft, getProfileId, saveDraft, setProfileId } from "@/lib/storage";
import { type OnboardingAnswer, type OnboardingQuestion, type Profile, profileRef } from "@/lib/types";
import { type Choice, ChoiceCards, Chips, Stepper, TextAnswer } from "./AnswerControls";
import {
  applyVoiceValue, type Draft, EMPTY_DRAFT, familySize, groupsPresent, isAnswered, markAnswered, questionsFor, REQUIRED,
  toProfileInput, totals,
} from "./draft";

type Phase = "intro" | "question" | "summary" | "done" | "restore";
type Voice =
  | { status: "idle" }
  | { status: "recording" }
  | { status: "sending" }
  | { status: "confirm"; result: OnboardingAnswer }
  | { status: "problem"; message: string };
type Saved = { draft: Draft; phase: Phase; index: number };

const KEY: Record<OnboardingQuestion, string> = {
  first_name: "firstName",
  city: "city",
  province: "province",
  country_of_origin: "country",
  gender: "gender",
  self_age: "selfAge",
  household: "household",
  disability: "disability",
  languages_spoken: "languages",
};
const HOUSEHOLD_GROUPS = [
  { id: "adults", icon: UserRound },
  { id: "seniors", icon: User },
  { id: "children_0_5", icon: Baby },
  { id: "children_6_17", icon: Users },
] as const;

// ARV-XXXX-XXXX-XXXX in Crockford base32, read the way backend/app/services/public_id.py does.
function normalizeId(value: string): string | null {
  let raw = value.replace(/[\s\-_.]/g, "").toUpperCase();
  if (raw.startsWith("ARV")) raw = raw.slice(3);
  raw = raw.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{12}$/.test(raw)) return null;
  return `ARV-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

function LevelMeter({ getLevel }: { getLevel: () => number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (bar.current) bar.current.style.transform = `scaleX(${Math.max(0.04, getLevel())})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel]);
  return (
    <div aria-hidden className="h-3 w-full max-w-xs overflow-hidden rounded-full bg-line">
      <div ref={bar} className="h-full w-full origin-left rounded-full bg-teal rtl:origin-right" />
    </div>
  );
}

export function Onboarding() {
  const t = useTranslations("Onboarding");
  const ta = useTranslations("Avatar");
  const te = useTranslations("Errors");
  const locale = useLocale();
  const router = useRouter();
  const info = languageInfo(locale);
  const { settings, update } = useSettings();
  const still = useReducedMotion();

  const [phase, setPhase] = useState<Phase>("intro");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [index, setIndex] = useState(0);
  const [toSummary, setToSummary] = useState(false);
  const [voice, setVoice] = useState<Voice>({ status: "idle" });
  const [micReady, setMicReady] = useState(false);
  const [created, setCreated] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [otherCountry, setOtherCountry] = useState(false);
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const speaker = useSpeaker(locale, info.tts);
  const recorder = useRecorder();
  const heading = useRef<HTMLHeadingElement>(null);
  const tapArea = useRef<HTMLElement>(null);
  const moved = useRef(false);

  const questions = useMemo(() => questionsFor(draft), [draft]);
  const q = questions[Math.min(index, questions.length - 1)];
  const k = KEY[q];
  const canSpeakAnswers = info.stt && micReady && recorder.state !== "denied" && recorder.state !== "unsupported";

  // Restore answers after a reload or a language switch (this tab only).
  useEffect(() => {
    const saved = getDraft<Saved>();
    /* eslint-disable react-hooks/set-state-in-effect -- saved answers and the microphone are only readable after hydration */
    if (saved?.draft) {
      setDraft({ ...EMPTY_DRAFT, ...saved.draft });
      setPhase(saved.phase === "done" ? "intro" : saved.phase);
      setIndex(saved.index || 0);
      setNameInput(saved.draft.first_name ?? "");
      setCityInput(saved.draft.city_name ?? "");
    }
    setMicReady(canRecord());
    // Scanned from an ID card QR code: /onboarding#open=ARV-...
    const opened = /^#open=([A-Za-z0-9-]{12,24})$/.exec(window.location.hash)?.[1];
    if (opened) {
      setRestoreInput(opened);
      setPhase("restore");
      history.replaceState(null, "", window.location.pathname);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (phase !== "done") saveDraft({ draft, phase, index } satisfies Saved);
  }, [draft, phase, index]);

  // ---------- speaking the question ----------

  const optionLabels = useCallback(
    (question: OnboardingQuestion): string[] => {
      switch (question) {
        case "city":
          return [t("city.ottawa"), t("city.other")];
        case "province":
          return [t("province.ontario"), t("province.other")];
        case "gender":
          return [t("gender.woman"), t("gender.man"), t("gender.another"), t("gender.prefer_not_to_say")];
        case "self_age":
          return [t("selfAge.yes"), t("selfAge.no")];
        default:
          return [];
      }
    },
    [t],
  );

  const spokenQuestion = useCallback(
    (question: OnboardingQuestion) => {
      const key = KEY[question];
      const parts = [t(`${key}.question`)];
      if (question === "household") parts.push(t("household.hint"));
      const options = optionLabels(question);
      if (options.length) parts.push(options.join(", "));
      return parts.join(" ");
    },
    [optionLabels, t],
  );

  const listenRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (phase !== "question") return;
    if (moved.current) heading.current?.focus();
    moved.current = true;
    let active = true;
    void (async () => {
      const finished = await speaker.speak(spokenQuestion(q));
      if (active && finished && settings.autoListen && info.stt) listenRef.current();
    })();
    const next = questions[index + 1];
    if (next && speaker.available) prefetchSpeech(spokenQuestion(next), locale);
    return () => {
      active = false;
      speaker.stop();
      recorder.cancel();
    };
    // Speak once per question shown; the speaker and recorder functions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, q]);

  // ---------- answering by voice ----------

  const listen = useCallback(async () => {
    unlockAudio();
    speaker.stop();
    setVoice({ status: "recording" });
    const rec = await recorder.record();
    if (!rec.audio) {
      if (rec.reason === "cancelled") return setVoice({ status: "idle" });
      const message =
        rec.reason === "denied" ? t("micDenied") : rec.reason === "unsupported" ? t("micUnsupported") : t("noSound");
      return setVoice({ status: "problem", message });
    }
    setVoice({ status: "sending" });
    const form = new FormData();
    form.append("question_key", q);
    form.append("language", locale);
    form.append("audio", rec.audio, `answer.${rec.audio.type.includes("mp4") ? "m4a" : "webm"}`);
    try {
      const result = await api<OnboardingAnswer>("/onboarding/answer", { method: "POST", form });
      setVoice({ status: "confirm", result });
      void speaker.speak(result.confirmation);
    } catch (err) {
      const code = errorCode(err);
      setVoice({ status: "problem", message: te(te.has(code) ? code : "stt_failed") });
    }
  }, [locale, q, recorder, speaker, t, te]);

  useEffect(() => {
    listenRef.current = () => void listen();
  }, [listen]);

  // ---------- moving between questions ----------

  const goTo = useCallback((next: Draft, nextIndex: number) => {
    setVoice({ status: "idle" });
    setError(null);
    const list = questionsFor(next);
    if (toSummary) {
      // Coming from the summary: only stop at a required question that is still open (e.g. the province).
      const open = list.findIndex((question) => REQUIRED.includes(question) && !isAnswered(next, question));
      if (open >= 0) {
        setIndex(open);
        return;
      }
      setToSummary(false);
      setPhase("summary");
      return;
    }
    if (nextIndex >= list.length) setPhase("summary");
    else setIndex(nextIndex);
  }, [toSummary]);

  const advance = (next: Draft) => {
    setDraft(next);
    goTo(next, questions.indexOf(q) + 1);
  };

  const back = () => {
    speaker.stop();
    recorder.cancel();
    setVoice({ status: "idle" });
    if (toSummary) {
      setToSummary(false);
      setPhase("summary");
    } else if (index === 0) {
      setPhase("intro");
    } else {
      setIndex(index - 1);
    }
  };

  const confirmVoice = (result: OnboardingAnswer) => {
    speaker.stop();
    const next = applyVoiceValue(draft, q, result.value);
    if (q === "first_name") setNameInput(next.first_name ?? "");
    if (q === "city") setCityInput(next.city_name ?? "");
    if (q === "household" && next.children_age_unknown > 0) {
      // Voice said how many children but not their ages: stay here so the steppers can fix it.
      setDraft(next);
      setVoice({ status: "idle" });
      tapArea.current?.focus();
      return;
    }
    if (q === "city" && next.city === "other" && !next.city_name) {
      setDraft(next);
      setVoice({ status: "idle" });
      return;
    }
    advance(next);
  };

  const tapInstead = () => {
    speaker.stop();
    recorder.cancel();
    setVoice({ status: "idle" });
    tapArea.current?.focus();
  };

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
      // Keep the first name on this phone even if the server has no encryption key to store it.
      cacheProfile({ ...profile, first_name: profile.first_name ?? body.first_name ?? null });
      saveDraft(null);
      setCreated(profile);
      setPhase("done");
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
    voice.status === "recording"
      ? "listening"
      : voice.status === "sending" || speaker.state === "loading"
        ? "thinking"
        : speaker.state === "speaking"
          ? "speaking"
          : "idle";
  const getLevel = useCallback(
    () => (voice.status === "recording" ? recorder.getLevel() : speaker.getLevel()),
    [recorder, speaker, voice.status],
  );

  const modeNote =
    !info.stt && !info.tts
      ? t("voiceOff", { language: info.nativeName })
      : info.tts && !info.stt
        ? t("listenOnly", { language: info.nativeName })
        : !info.tts && info.stt
          ? t("speakOnly", { language: info.nativeName })
          : null;

  // ---------- screens ----------

  if (phase === "intro") {
    const greeting = [t("introTitle"), t("introBody"), t("introPrivacy"), info.stt ? t("introHow") : t("introHowTap")].join(" ");
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
        <Avatar state={avatarState} label={ta(avatarState)} getLevel={getLevel} />
        <h1 className="font-display text-3xl font-semibold">{t("introTitle")}</h1>
        <div className="flex flex-col gap-3 text-lg">
          <p>{t("introBody")}</p>
          <p className="flex items-start justify-center gap-2 rounded-card bg-teal-light p-3 text-start font-bold text-teal">
            <Check aria-hidden className="mt-1 size-5 shrink-0" />
            {t("introPrivacy")}
          </p>
          <p>{info.stt ? t("introHow") : t("introHowTap")}</p>
        </div>
        {modeNote && (
          <p role="note" className="card w-full bg-amber-light text-start text-amber-ink">
            {modeNote}
          </p>
        )}
        {speaker.available && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              unlockAudio();
              void speaker.speak(greeting);
            }}
          >
            <Volume2 aria-hidden className="size-5" />
            {t("listenIntro")}
          </button>
        )}
        {info.stt && micReady && (
          <label className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 text-start">
            <span className="font-bold">{t("autoListen")}</span>
            <input
              type="checkbox"
              className="size-6 accent-teal"
              checked={settings.autoListen}
              onChange={(e) => update({ autoListen: e.target.checked })}
            />
          </label>
        )}
        <button
          type="button"
          className="btn btn-primary min-h-14 w-full text-lg"
          onClick={() => {
            unlockAudio();
            speaker.stop();
            setPhase("question");
          }}
        >
          {t("start")}
          <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => setPhase("restore")}>
          {t("haveId")}
        </button>
      </main>
    );
  }

  if (phase === "restore") {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-8">
        <button type="button" className="btn btn-quiet self-start !px-0" onClick={() => setPhase("intro")}>
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("back")}
        </button>
        <h1 className="font-display text-3xl font-semibold">{t("restore.title")}</h1>
        <p className="text-lg">{t("restore.intro")}</p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void restore();
          }}
        >
          <label htmlFor="restore-id" className="label text-lg">
            {t("restore.label")}
          </label>
          <input
            id="restore-id"
            className="field min-h-14 font-mono text-2xl tracking-widest uppercase"
            lang="en"
            dir="ltr"
            inputMode="text"
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
            {t("restore.open")}
          </button>
        </form>
        <button type="button" className="btn btn-quiet self-start" onClick={() => setPhase("intro")}>
          {t("restore.startOver")}
        </button>
      </main>
    );
  }

  if (phase === "done" && created) {
    const id = profileRef(created);
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-8 text-center">
        <Avatar state="idle" label={ta("idle")} />
        <h1 className="font-display text-3xl font-semibold">{t("done.title")}</h1>
        <section aria-labelledby="id-label" className="card flex w-full flex-col items-center gap-2">
          <h2 id="id-label" className="eyebrow">
            {t("done.idLabel")}
          </h2>
          <p lang="en" dir="ltr" className="font-mono text-3xl font-bold tracking-wider text-teal break-all">
            {id}
          </p>
        </section>
        <p className="text-lg">{t("done.idNote")}</p>
        <button type="button" className="btn btn-primary min-h-14 w-full text-lg" onClick={() => router.push("/home")}>
          {t("done.go")}
          <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
        </button>
      </main>
    );
  }

  if (phase === "summary") return renderSummary();

  // ---------- one question ----------

  const optional = !REQUIRED.includes(q);
  const skip = () => advance(markAnswered(q === "first_name" ? { ...draft, first_name: null } : draft, q));
  const total = questions.length;
  const position = questions.indexOf(q) + 1;

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="btn btn-quiet !px-0" onClick={back}>
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("back")}
        </button>
        <p className="eyebrow">{t("progress", { current: position, total })}</p>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label={t("progress", { current: position, total })}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={position}
      >
        <div className="h-full rounded-full bg-teal" style={{ width: `${(position / total) * 100}%` }} />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar state={avatarState} label={ta(avatarState)} getLevel={getLevel} size={128} />
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl leading-tight font-semibold">
          {t(`${k}.question`)}
        </h1>
        {(q === "household" || q === "gender" || q === "country_of_origin" || q === "disability" || q === "languages_spoken") && (
          <p className="text-muted">{t(`${k}.hint`)}</p>
        )}
        {speaker.available && (
          <button
            type="button"
            className="btn btn-secondary !min-h-11"
            onClick={() => {
              unlockAudio();
              recorder.cancel();
              setVoice({ status: "idle" });
              void speaker.speak(spokenQuestion(q));
            }}
          >
            <RotateCcw aria-hidden className="size-5" />
            {t("repeat")}
          </button>
        )}
        {speaker.failed && info.tts && <p className="text-sm text-muted">{t("ttsFailed")}</p>}
      </div>

      {info.stt && renderVoicePanel()}

      <section
        ref={tapArea}
        tabIndex={-1}
        aria-labelledby="tap-title"
        className="flex flex-col gap-3 rounded-card outline-offset-4"
      >
        <h2 id="tap-title" className={info.stt ? "eyebrow" : "sr-only"}>
          {t("orTap")}
        </h2>
        {renderTapAnswer()}
      </section>

      {optional && (
        <div className="flex flex-col items-center gap-1">
          <button type="button" className="btn btn-quiet" onClick={skip}>
            {t("skip")}
          </button>
          <p className="text-sm text-muted">{t("optional")}</p>
        </div>
      )}
    </main>
  );

  // ---------- pieces: plain render functions (not components), so inputs keep focus between renders ----------

  function renderVoicePanel() {
    if (!canSpeakAnswers && voice.status === "idle") {
      if (recorder.state === "denied") return <p className="card bg-amber-light text-amber-ink">{t("micDenied")}</p>;
      if (recorder.state === "unsupported" || !micReady) return null;
    }
    if (voice.status === "recording") {
      return (
        <div className="flex flex-col items-center gap-3">
          <LevelMeter getLevel={recorder.getLevel} />
          <button
            type="button"
            className="btn btn-primary min-h-16 px-8 text-lg"
            onClick={recorder.stop}
            disabled={recorder.state !== "recording"}
          >
            <Square aria-hidden className="size-5" />
            {t("stopSpeaking")}
          </button>
        </div>
      );
    }
    if (voice.status === "sending") {
      return (
        <p role="status" className="flex items-center justify-center gap-2 text-lg font-bold">
          <Loader2 aria-hidden className={`size-6 text-teal ${still ? "" : "animate-spin"}`} />
          {t("understanding")}
        </p>
      );
    }
    if (voice.status === "confirm") {
      const r = voice.result;
      return (
        <div className="card flex flex-col gap-3" role="group" aria-labelledby="confirm-text">
          <p id="confirm-text" role="status" className="text-xl font-bold" dir="auto">
            {r.confirmation}
          </p>
          {r.heard && (
            <p className="text-sm text-muted" dir="auto">
              {t("heard", { text: r.heard })}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {r.understood && (
              <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={() => confirmVoice(r)}>
                <Check aria-hidden className="size-6" />
                {t("yes")}
              </button>
            )}
            <button type="button" className="btn btn-secondary min-h-14 text-lg" onClick={() => void listen()}>
              <Mic aria-hidden className="size-6" />
              {t("tryAgain")}
            </button>
            <button type="button" className="btn btn-secondary min-h-14 text-lg" onClick={tapInstead}>
              <Keyboard aria-hidden className="size-6" />
              {t("tapInstead")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2">
        {voice.status === "problem" && (
          <p role="alert" className="card w-full bg-amber-light text-amber-ink">
            {voice.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => void listen()}
          className="flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-teal px-8 text-xl font-bold text-white hover:bg-teal-hover"
        >
          <Mic aria-hidden className="size-8" />
          {t("speak")}
        </button>
        <p className="text-sm text-muted">{t("micPermission")}</p>
      </div>
    );
  }

  function renderTapAnswer() {
    const next = (d: Draft) => advance(markAnswered(d, q));
    switch (q) {
      case "first_name":
        return (
          <>
            <TextAnswer
              label={t("firstName.label")}
              hint={t("firstName.hint")}
              value={nameInput}
              onChange={setNameInput}
              onSubmit={() => next({ ...draft, first_name: nameInput.trim() || null })}
              autoComplete="given-name"
              maxLength={40}
            />
            {nextButton(() => next({ ...draft, first_name: nameInput.trim() || null }))}
          </>
        );
      case "city":
        return (
          <>
            <ChoiceCards
              choices={[
                { id: "ottawa", label: t("city.ottawa"), icon: Building2 },
                { id: "other", label: t("city.other"), icon: MapPin },
              ]}
              value={draft.city}
              onChoose={(id) => {
                if (id === "ottawa") next({ ...draft, city: "ottawa", city_name: null, province: "ontario" });
                else setDraft({ ...draft, city: "other", province: draft.city === "ottawa" ? null : draft.province });
              }}
            />
            {draft.city === "other" && (
              <>
                <TextAnswer
                  label={t("city.nameLabel")}
                  value={cityInput}
                  onChange={setCityInput}
                  onSubmit={() => cityInput.trim() && next({ ...draft, city_name: cityInput.trim() })}
                  autoComplete="address-level2"
                  maxLength={80}
                />
                {nextButton(() => next({ ...draft, city_name: cityInput.trim() }), !cityInput.trim())}
              </>
            )}
          </>
        );
      case "province":
        return (
          <ChoiceCards
            choices={[
              { id: "ontario", label: t("province.ontario"), icon: MapPin },
              { id: "other", label: t("province.other"), icon: Globe2 },
            ]}
            value={draft.province}
            onChoose={(id) => next({ ...draft, province: id as Draft["province"] })}
          />
        );
      case "country_of_origin": {
        const common = COMMON_COUNTRIES.map((c) => ({ id: c, label: countryName(c, locale) }));
        const all = ALL_COUNTRIES.map((c) => ({ id: c, label: countryName(c, locale) })).sort((a, b) =>
          a.label.localeCompare(b.label, info.intl),
        );
        const showOther =
          otherCountry || (draft.country_of_origin !== null && !(COMMON_COUNTRIES as readonly string[]).includes(draft.country_of_origin));
        return (
          <>
            <ChoiceCards
              columns={2}
              choices={[...common, { id: "__other", label: t("country.other"), icon: Globe2 }]}
              value={showOther ? "__other" : draft.country_of_origin}
              onChoose={(id) => {
                if (id === "__other") setOtherCountry(true);
                else next({ ...draft, country_of_origin: id });
              }}
            />
            {showOther && (
              <div className="flex flex-col gap-2">
                <label htmlFor="country-select" className="label text-lg">
                  {t("country.selectLabel")}
                </label>
                <select
                  id="country-select"
                  className="field min-h-14 text-lg"
                  value={draft.country_of_origin ?? ""}
                  onChange={(e) => setDraft({ ...draft, country_of_origin: e.target.value || null })}
                >
                  <option value="">{t("country.choose")}</option>
                  {all.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {nextButton(() => next(draft), !draft.country_of_origin)}
              </div>
            )}
          </>
        );
      }
      case "gender":
        return (
          <ChoiceCards
            choices={(["woman", "man", "another", "prefer_not_to_say"] as const).map((g) => ({
              id: g,
              label: t(`gender.${g}`),
            }))}
            value={draft.gender}
            onChoose={(id) => next({ ...draft, gender: id as Draft["gender"] })}
          />
        );
      case "self_age":
        return (
          <ChoiceCards
            choices={[
              { id: "senior", label: t("selfAge.yes"), icon: User },
              { id: "adult", label: t("selfAge.no"), icon: UserRound },
            ]}
            value={draft.self_age_group}
            onChoose={(id) => next({ ...draft, self_age_group: id as Draft["self_age_group"] })}
          />
        );
      case "household": {
        const set = (group: keyof Draft["others"], n: number) =>
          setDraft({ ...draft, others: { ...draft.others, [group]: n } });
        return (
          <>
            {draft.children_age_unknown > 0 && (
              <p role="status" className="card bg-amber-light font-bold text-amber-ink">
                {t("household.agesNeeded", { count: draft.children_age_unknown })}
              </p>
            )}
            {HOUSEHOLD_GROUPS.map(({ id, icon }) => (
              <Stepper
                key={id}
                label={t(`household.${id}`)}
                icon={icon}
                value={draft.others[id]}
                onChange={(n) => set(id, n)}
                fewerLabel={t("household.fewer", { group: t(`household.${id}`) })}
                moreLabel={t("household.more", { group: t(`household.${id}`) })}
              />
            ))}
            <p aria-live="polite" className="text-center text-lg font-bold">
              {t("household.total", { count: familySize(draft) })}
            </p>
            {nextButton(() => next({ ...draft, children_age_unknown: 0 }))}
            <button
              type="button"
              className="btn btn-secondary min-h-14 text-lg"
              onClick={() =>
                next({ ...draft, others: { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 }, children_age_unknown: 0 })
              }
            >
              <User aria-hidden className="size-5" />
              {t("household.alone")}
            </button>
          </>
        );
      }
      case "disability": {
        const present = groupsPresent(draft);
        const groups = (["adult", "senior", "child"] as const).filter((g) => present[g]);
        const picked = draft.disability && typeof draft.disability === "object" ? draft.disability : null;
        const values = [
          ...groups.filter((g) => picked?.[g]),
          ...(draft.disability === "none" ? ["none"] : []),
          ...(draft.disability === "prefer_not" ? ["prefer_not"] : []),
        ];
        const toggle = (id: string) => {
          if (id === "none" || id === "prefer_not") {
            setDraft({ ...draft, disability: draft.disability === id ? null : (id as "none" | "prefer_not") });
            return;
          }
          const base = picked ?? { adult: false, senior: false, child: false };
          const updated = { ...base, [id]: !base[id as "adult"] };
          setDraft({ ...draft, disability: updated.adult || updated.senior || updated.child ? updated : null });
        };
        const choices: Choice[] = [
          ...groups.map((g) => ({ id: g, label: t(`disability.${g}`) })),
          { id: "none", label: t("disability.none") },
          { id: "prefer_not", label: t("disability.prefer_not") },
        ];
        return (
          <>
            <Chips choices={choices} values={values} onToggle={toggle} />
            {nextButton(() => next(draft), draft.disability === null)}
          </>
        );
      }
      case "languages_spoken": {
        const choices: Choice[] = OTHER_LANGUAGES.filter((l) => l.code !== locale).map((l) => ({
          id: l.code,
          label: l.nativeName === languageName(l.code, locale) ? l.nativeName : `${l.nativeName} · ${languageName(l.code, locale)}`,
        }));
        return (
          <>
            <Chips
              choices={choices}
              values={draft.other_languages}
              onToggle={(id) =>
                setDraft({
                  ...draft,
                  other_languages: draft.other_languages.includes(id)
                    ? draft.other_languages.filter((l) => l !== id)
                    : [...draft.other_languages, id].slice(0, 10),
                })
              }
            />
            {nextButton(() => next(draft))}
          </>
        );
      }
    }
  }

  function nextButton(onClick: () => void, disabled = false) {
    return (
      <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={onClick} disabled={disabled}>
        {t("next")}
        <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
      </button>
    );
  }

  function renderSummary() {
    const ts = (key: string, values?: Record<string, string | number>) => t(`summary.${key}`, values);
    const tot = totals(draft);
    const household = [
      tot.adults ? ts("adults", { count: tot.adults }) : null,
      tot.seniors ? ts("seniors", { count: tot.seniors }) : null,
      tot.children_0_5 ? ts("children_0_5", { count: tot.children_0_5 }) : null,
      tot.children_6_17 ? ts("children_6_17", { count: tot.children_6_17 }) : null,
    ].filter(Boolean).join(", ");
    const dis = draft.disability;
    const disability =
      dis === null
        ? ts("notGiven")
        : dis === "none"
          ? t("disability.none")
          : dis === "prefer_not"
            ? t("disability.prefer_not")
            : (["adult", "senior", "child"] as const).filter((g) => dis[g]).map((g) => t(`disability.${g}`)).join(", ");
    const rows: { q: OnboardingQuestion; label: string; value: string }[] = [
      { q: "first_name", label: ts("name"), value: draft.first_name || ts("notGiven") },
      { q: "city", label: ts("city"), value: draft.city === "ottawa" ? t("city.ottawa") : draft.city_name || ts("notGiven") },
      ...(draft.city === "other"
        ? [{ q: "province" as const, label: ts("province"), value: draft.province === "ontario" ? ts("ontario") : draft.province === "other" ? ts("otherProvince") : ts("notGiven") }]
        : []),
      { q: "country_of_origin", label: ts("country"), value: draft.country_of_origin ? countryName(draft.country_of_origin, locale) : ts("notGiven") },
      { q: "gender", label: ts("gender"), value: draft.gender ? t(`gender.${draft.gender}`) : ts("notGiven") },
      { q: "self_age", label: ts("age"), value: draft.self_age_group === "senior" ? ts("ageSenior") : ts("ageAdult") },
      { q: "household", label: t("household.total", { count: familySize(draft) }), value: household },
      { q: "disability", label: ts("disability"), value: disability },
      {
        q: "languages_spoken",
        label: ts("languages"),
        value: draft.other_languages.length ? draft.other_languages.map((l) => languageName(l, locale)).join(", ") : t("languages.none"),
      },
    ];
    const ready = REQUIRED.filter((r) => questions.includes(r)).every((r) => isAnswered(draft, r));
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
        <button type="button" className="btn btn-quiet self-start !px-0" onClick={() => { setIndex(questions.length - 1); setPhase("question"); }}>
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("back")}
        </button>
        <div className="flex items-center gap-4">
          <Avatar state="idle" label={ta("idle")} size={88} />
          <div>
            <h1 className="font-display text-3xl font-semibold">{ts("title")}</h1>
            <p className="text-muted">{ts("intro")}</p>
          </div>
        </div>
        <dl className="card flex flex-col divide-y divide-line !p-0">
          {rows.map((row) => (
            <div key={row.q} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <dt className="text-sm font-bold text-muted">{row.label}</dt>
                <dd className="text-lg font-bold break-words" dir="auto">
                  {row.value}
                </dd>
              </div>
              <button
                type="button"
                className="btn btn-secondary !min-h-11 shrink-0"
                aria-label={ts("changeLabel", { item: row.label })}
                onClick={() => {
                  setToSummary(true);
                  setIndex(questions.indexOf(row.q));
                  setPhase("question");
                }}
              >
                {ts("change")}
              </button>
            </div>
          ))}
        </dl>
        <div className="card flex items-start justify-between gap-4">
          <label htmlFor="consent" className="flex flex-col gap-1">
            <span className="text-lg font-bold">{ts("consentTitle")}</span>
            <span className="text-muted">{ts("consentBody")}</span>
          </label>
          <button
            id="consent"
            type="button"
            role="switch"
            aria-checked={draft.analytics_consent}
            onClick={() => setDraft({ ...draft, analytics_consent: !draft.analytics_consent })}
            className={`relative mt-1 inline-flex h-9 w-16 shrink-0 items-center rounded-full border-2 ${
              draft.analytics_consent ? "border-teal bg-teal" : "border-muted bg-surface"
            }`}
          >
            <span className={`absolute size-6 rounded-full ${draft.analytics_consent ? "end-1 bg-white" : "start-1 bg-muted"}`} />
          </button>
        </div>
        {error && <ErrorNote code={error} onRetry={() => void create()} />}
        <button type="button" className="btn btn-primary min-h-16 text-xl" onClick={() => void create()} disabled={saving || !ready}>
          {saving ? <Loader2 aria-hidden className="size-6 animate-spin" /> : <Check aria-hidden className="size-6" />}
          {saving ? ts("creating") : ts("create")}
        </button>
      </main>
    );
  }
}

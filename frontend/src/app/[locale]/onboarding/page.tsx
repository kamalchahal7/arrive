"use client";

import {
  ArrowLeft, ArrowRight, Baby, BookOpen, Briefcase, Building2, CalendarClock, CalendarDays, CalendarRange, Check,
  CircleHelp, FileText, GraduationCap, HeartPulse, Home, Landmark, Languages, MapPin, UserRound, Users, Wallet, X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppShell";
import { ListenButton } from "@/components/ListenButton";
import { ErrorNote } from "@/components/Notices";
import { useRouter } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getProfileId, setProfileId } from "@/lib/storage";
import type { Profile, ProfileInput } from "@/lib/types";

type Option = { id: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; hint?: string };
type Question = { key: string; multi?: boolean; options: Option[] };

const QUESTIONS: Question[] = [
  { key: "status", options: [
    { id: "refugee_pr", icon: Landmark, hint: "refugee_prHint" },
    { id: "international_student", icon: GraduationCap, hint: "international_studentHint" },
  ] },
  { key: "arrival", options: [
    { id: "thisWeek", icon: CalendarClock },
    { id: "lessThanMonth", icon: CalendarDays },
    { id: "oneToThree", icon: CalendarRange },
    { id: "moreThanThree", icon: CalendarRange },
  ] },
  { key: "city", options: [{ id: "ottawa", icon: Building2 }, { id: "otherOntario", icon: MapPin }] },
  { key: "children", options: [{ id: "yes", icon: Baby }, { id: "no", icon: X }] },
  { key: "seniors", options: [{ id: "yes", icon: Users }, { id: "no", icon: X }] },
  { key: "needs", multi: true, options: [
    { id: "health", icon: HeartPulse }, { id: "housing", icon: Home }, { id: "work", icon: Briefcase },
    { id: "school", icon: BookOpen }, { id: "language", icon: Languages }, { id: "money", icon: Wallet },
    { id: "documents", icon: FileText },
  ] },
];

const ARRIVAL_DAYS: Record<string, number> = { thisWeek: 3, lessThanMonth: 14, oneToThree: 60, moreThanThree: 120 };

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function toProfile(answers: Record<string, string | string[]>, locale: string): ProfileInput {
  const a = (k: string) => answers[k] as string | undefined;
  const yesNo = (v?: string) => (v === "yes" ? true : v === "no" ? false : null);
  return {
    status: a("status") && a("status") !== "unsure" ? a("status") : "unknown",
    arrival_date: a("arrival") && ARRIVAL_DAYS[a("arrival")!] !== undefined ? isoDaysAgo(ARRIVAL_DAYS[a("arrival")!]) : null,
    city: a("city") === "ottawa" ? "ottawa" : a("city") === "otherOntario" ? "other" : "unknown",
    province: a("city") === "ottawa" || a("city") === "otherOntario" ? "ontario" : "unknown",
    has_children: yesNo(a("children")),
    has_seniors: yesNo(a("seniors")),
    needs: Array.isArray(answers.needs) ? answers.needs : [],
    preferred_language: locale,
    languages: [locale],
  };
}

export default function OnboardingPage() {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const q = QUESTIONS[index];
  const total = QUESTIONS.length;
  const selectedMulti = (answers.needs as string[] | undefined) || [];

  useEffect(() => {
    // Move focus to the new question so screen reader and keyboard users know it changed.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [index]);

  const finish = async (final: Record<string, string | string[]>) => {
    setSaving(true);
    setError(null);
    try {
      const body = toProfile(final, locale);
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
      setProfileId(profile.id);
      router.push("/roadmap");
    } catch (err) {
      setError(errorCode(err));
      setSaving(false);
    }
  };

  const choose = (value: string) => {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (index < total - 1) setIndex(index + 1);
    else void finish(next);
  };

  const toggleNeed = (id: string) => {
    const set = new Set(selectedMulti);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setAnswers({ ...answers, needs: [...set] });
  };

  const questionText = t(`${q.key}.question`);
  const spoken = [questionText, ...q.options.map((o) => t(`${q.key}.${o.id}`)), tc("notSure")].join(". ");

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-6">
        <div className="flex flex-col gap-2">
          <p className="eyebrow" aria-live="polite">
            {t("progress", { current: index + 1, total })}
          </p>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label={t("progress", { current: index + 1, total })}
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={index + 1}
          >
            <div className="h-full rounded-full bg-teal" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
        </div>

        {index === 0 && <p className="simple-hide text-muted">{t("intro")}</p>}

        <fieldset className="flex flex-col gap-4" disabled={saving}>
          <legend className="contents">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl leading-tight font-semibold">
              {questionText}
            </h1>
          </legend>
          {q.multi && <p className="text-muted">{t(`${q.key}.hint`)}</p>}
          <div>
            <ListenButton key={q.key} text={spoken} language={locale} />
          </div>

          <ul className={`grid gap-3 ${q.multi ? "grid-cols-2" : "grid-cols-1"}`}>
            {q.options.map((o) => {
              const Icon = o.icon;
              const selected = q.multi ? selectedMulti.includes(o.id) : answers[q.key] === o.id;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => (q.multi ? toggleNeed(o.id) : choose(o.id))}
                    aria-pressed={selected}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-card border-2 px-4 py-3 text-start text-lg font-bold ${
                      selected ? "border-teal bg-teal-light text-teal" : "border-line bg-surface hover:border-teal"
                    }`}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-teal-light text-teal">
                      {selected && q.multi ? <Check aria-hidden className="size-6" /> : <Icon aria-hidden className="size-6" />}
                    </span>
                    <span className="flex flex-col">
                      {t(`${q.key}.${o.id}`)}
                      {o.hint && <span className="text-base font-normal text-muted">{t(`${q.key}.${o.hint}`)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {q.multi ? (
            <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={() => finish(answers)}>
              {saving ? t("creating") : t("finish")}
              <ArrowRight aria-hidden className="size-6 rtl:-scale-x-100" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => choose("unsure")}
              className="flex min-h-14 w-full items-center gap-3 rounded-card border-2 border-dashed border-line bg-surface px-4 py-3 text-start text-lg font-bold text-muted hover:border-teal"
            >
              <CircleHelp aria-hidden className="size-6" />
              {tc("notSure")}
            </button>
          )}
        </fieldset>

        {saving && (
          <p role="status" className="flex items-center gap-2 font-bold">
            <UserRound aria-hidden className="size-5 text-teal" />
            {t("creating")}
          </p>
        )}
        {error && <ErrorNote code={error} onRetry={() => finish(answers)} />}

        {index > 0 && (
          <button type="button" className="btn btn-quiet self-start" onClick={() => setIndex(index - 1)} disabled={saving}>
            <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
            {tc("back")}
          </button>
        )}
      </main>
    </>
  );
}

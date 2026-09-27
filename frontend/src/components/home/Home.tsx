"use client";

// Home screen (docs/REDESIGN.md section 6): greeting and progress, the checklist by phase (current phase open),
// programs for the family, a "More help" menu, and the floating "Ask the avatar" button.

import { Check, ChevronDown, ChevronRight, CloudOff, LogOut, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote } from "@/components/Notices";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { track } from "@/lib/events";
import { cacheChecklist, cachedChecklist, flush, pending, saveChange, withStatus } from "@/lib/progress";
import { cacheProfile, getCachedProfile, getProfileId } from "@/lib/storage";
import type { Checklist, ChecklistRow, Profile, Programs } from "@/lib/types";
import { MoreHelp } from "./MoreHelp";

const PROGRAMS_KEY = "arrive.programs";

function cachedPrograms(lang: string): Programs | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRAMS_KEY) || "null") as { lang: string; programs: Programs } | null;
    return saved?.lang === lang ? saved.programs : null;
  } catch {
    return null;
  }
}

export function Home() {
  const t = useTranslations("Home");
  const tp = useTranslations("Programs");
  const locale = useLocale();
  const [profileId, setId] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [programs, setPrograms] = useState<Programs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [unsynced, setUnsynced] = useState(false);
  const [open, setOpen] = useState<Set<string> | null>(null);

  const load = useCallback(
    async (pid: string) => {
      setError(null);
      await flush(pid).then((ok) => setUnsynced(!ok));
      const [c, p, prof] = await Promise.allSettled([
        api<Checklist>(`/checklist/${pid}?lang=${locale}`),
        api<Programs>(`/programs/${pid}?lang=${locale}`),
        api<Profile>(`/profile/${pid}`),
      ]);
      if (c.status === "fulfilled") {
        cacheChecklist(locale, c.value);
        setChecklist(cachedChecklist(locale) ?? c.value);
        setOffline(false);
      } else if (!cachedChecklist(locale)) {
        setError(errorCode(c.reason));
      } else {
        setOffline(true);
      }
      if (p.status === "fulfilled") {
        setPrograms(p.value);
        try {
          localStorage.setItem(PROGRAMS_KEY, JSON.stringify({ lang: locale, programs: p.value }));
        } catch {
          /* storage full or unavailable */
        }
      }
      if (prof.status === "fulfilled") {
        // Keep a first name this phone knows about if the server could not store it (no encryption key).
        const local = getCachedProfile<Profile>();
        const merged = { ...prof.value, first_name: prof.value.first_name ?? local?.first_name ?? null };
        cacheProfile(merged);
        setProfile(merged);
      }
    },
    [locale],
  );

  useEffect(() => {
    const pid = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the profile and saved checklist live in localStorage */
    setId(pid);
    setProfile(getCachedProfile<Profile>());
    setChecklist(cachedChecklist(locale));
    setPrograms(cachedPrograms(locale));
    setUnsynced(pending().length > 0);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!pid) return;
    void load(pid);
    const back = () => void load(pid);
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, [load, locale]);

  const toggle = async (row: ChecklistRow) => {
    if (!profileId || !checklist) return;
    const change = { item_id: row.item_id, person_key: row.person_key, status: row.status === "done" ? "todo" : "done" } as const;
    const next = withStatus(checklist, change);
    setChecklist(next);
    cacheChecklist(locale, next);
    if (change.status === "done") track("item_done", locale, row.item_id);
    setUnsynced(!(await saveChange(profileId, change)));
  };

  if (profileId === null) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-lg">{t("noProfile")}</p>
        <Link href="/onboarding" className="btn btn-primary self-start">
          {t("start")}
        </Link>
      </main>
    );
  }

  // The current phase starts open; the person can open and close any phase.
  const expanded = open ?? new Set(checklist?.current_phase ? [checklist.current_phase] : []);
  const togglePhase = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const name = profile?.first_name;
  const pct = checklist && checklist.total ? Math.round((checklist.done / checklist.total) * 100) : 0;

  return (
    <>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-4 pt-4 pb-32">
        <section aria-labelledby="hello" className="flex flex-col gap-2">
          <h1 id="hello" className="font-display text-3xl font-semibold" dir="auto">
            {name ? t("hello", { name }) : t("helloNoName")}
          </h1>
          {checklist && (
            <>
              <p className="text-lg font-bold">{t("progress", { done: checklist.done, total: checklist.total })}</p>
              <div
                className="h-3 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label={t("progress", { done: checklist.done, total: checklist.total })}
                aria-valuemin={0}
                aria-valuemax={checklist.total}
                aria-valuenow={checklist.done}
              >
                <div className="h-full rounded-full bg-teal" style={{ inlineSize: `${pct}%` }} />
              </div>
            </>
          )}
        </section>

        {(offline || unsynced) && (
          <p role="status" className="card flex items-start gap-2 bg-amber-light text-amber-ink">
            <CloudOff aria-hidden className="mt-0.5 size-5 shrink-0" />
            {offline ? t("offline") : t("savedLocally")}
          </p>
        )}
        {checklist?.notes.map((n) => (
          <p key={n} className="card bg-teal-light">
            {n}
          </p>
        ))}
        {error && <ErrorNote code={error} onRetry={profileId ? () => void load(profileId) : undefined} />}

        <section aria-labelledby="checklist-title" className="flex flex-col gap-3">
          <h2 id="checklist-title" className="eyebrow text-base">
            {t("checklistTitle")}
          </h2>
          {!checklist && !error && <p className="text-muted">{t("loading")}</p>}
          {checklist && checklist.total > 0 && checklist.done === checklist.total && (
            <p className="card bg-teal-light font-bold text-teal">{t("allDone")}</p>
          )}
          {checklist?.phases.map((phase) => {
            const isOpen = expanded.has(phase.id);
            const current = phase.id === checklist.current_phase;
            return (
              <div key={phase.id} className={`card !p-0 ${current ? "border-2 border-teal" : ""}`}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`phase-${phase.id}`}
                    onClick={() => togglePhase(phase.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start"
                  >
                    <span className="flex-1 text-lg font-bold">
                      {phase.label}
                      {current && <span className="ms-2 rounded-full bg-teal px-2 py-0.5 text-sm text-white">{t("now")}</span>}
                    </span>
                    <span className="text-sm font-bold text-muted">{t("phaseProgress", { done: phase.done, total: phase.total })}</span>
                    <ChevronDown aria-hidden className={`size-6 shrink-0 text-teal ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </h3>
                {isOpen && (
                  <ul id={`phase-${phase.id}`} className="flex flex-col divide-y divide-line border-t border-line">
                    {phase.items.map((row) => {
                      const done = row.status === "done";
                      return (
                        <li key={`${row.item_id}:${row.person_key}`} className="flex items-stretch">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={done}
                            aria-label={t("checkLabel", { title: row.title, person: row.person_label })}
                            onClick={() => void toggle(row)}
                            className="flex w-16 shrink-0 items-center justify-center"
                          >
                            <span
                              aria-hidden
                              className={`flex size-9 items-center justify-center rounded-lg border-2 ${
                                done ? "border-teal bg-teal text-white" : "border-muted bg-surface"
                              }`}
                            >
                              {done && <Check className="size-6" strokeWidth={3} />}
                            </span>
                          </button>
                          <Link
                            href={`/item/${row.item_id}`}
                            className="flex min-h-16 flex-1 items-center gap-2 py-3 pe-3"
                          >
                            <span className="flex flex-1 flex-col">
                              <span className={`font-bold ${done ? "text-muted line-through" : ""}`}>{row.title}</span>
                              <span className="text-sm text-muted" dir="auto">
                                {row.person_label}
                              </span>
                            </span>
                            {row.essential && (
                              <span className="rounded-full bg-amber-light px-2 py-0.5 text-sm font-bold text-amber-ink">
                                {t("essential")}
                              </span>
                            )}
                            <ChevronRight aria-hidden className="size-5 shrink-0 text-muted rtl:-scale-x-100" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        <section aria-labelledby="programs-title" className="flex flex-col gap-3">
          <div>
            <h2 id="programs-title" className="eyebrow text-base">
              {tp("title")}
            </h2>
            <p className="text-muted">{tp("intro")}</p>
          </div>
          {programs && programs.programs.length === 0 && <p className="card">{tp("none")}</p>}
          {programs && programs.programs.length > 0 && (
            <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
              {programs.programs.map((p) => (
                <li key={p.id} className="w-64 shrink-0 snap-start">
                  <Link href={`/item/${p.id}`} className="card flex h-full flex-col gap-2 hover:border-teal">
                    <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                      <span className="rounded-full bg-teal-light px-2 py-0.5 text-teal">{tp(`group.${p.group}`)}</span>
                      <span className="rounded-full bg-ground px-2 py-0.5 text-muted">{tp(`level.${p.level}`)}</span>
                    </span>
                    <span className="text-lg font-bold leading-snug">{p.title}</span>
                    <span className="line-clamp-3 text-sm text-muted">{p.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {programs && programs.programs.length > 0 && (
            <Link href="/programs" className="btn btn-quiet self-start !px-0">
              {tp("seeAll")}
            </Link>
          )}
        </section>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <MoreHelp />
          <Link href="/end" className="btn btn-secondary min-h-14">
            <LogOut aria-hidden className="size-5 rtl:-scale-x-100" />
            {t("endSession")}
          </Link>
        </div>
      </main>

      <Link
        href="/assistant"
        className="fixed end-4 bottom-4 z-30 flex min-h-16 items-center gap-2 rounded-full bg-teal px-5 text-lg font-bold text-white shadow-lg hover:bg-teal-hover"
        style={{ marginBlockEnd: "env(safe-area-inset-bottom)" }}
      >
        <span aria-hidden className="relative flex">
          <MessageCircleQuestion className="size-7" />
          <Sparkles className="absolute -end-1.5 -top-1.5 size-4" />
        </span>
        {t("askAvatar")}
      </Link>
    </>
  );
}

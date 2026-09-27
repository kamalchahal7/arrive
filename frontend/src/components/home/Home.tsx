"use client";

// Home: greeting and progress, the checklist by phase (Day 1–3 ... Months 4–6, current phase open), the
// government-run programs for this household (title only), and the floating "Ask Aba" button.
// Checklist and programs come from the hardcoded Ottawa data (src/data), filtered by the profile on this phone.

import { Check, ChevronDown, ChevronRight, LogOut } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Pair, useBi } from "@/components/Bi";
import { tr } from "@/data/types";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { track } from "@/lib/events";
import { checklistFor, doneItems, programsFor, setDone } from "@/lib/household";
import { cacheProfile, getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";

export function Home() {
  const b = useBi("Home");
  const bp = useBi("Programs");
  const bph = useBi("Phases");
  const locale = useLocale();
  const [profileId, setId] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [done, setDoneState] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<string> | null>(null);

  useEffect(() => {
    const pid = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the profile and ticks live in localStorage */
    setId(pid);
    setProfile(getCachedProfile<Profile>());
    setDoneState(doneItems());
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!pid) return;
    api<Profile>(`/profile/${pid}`)
      .then((p) => {
        // Keep what only this phone knows (the first name if the server could not store it, the country as said).
        const local = getCachedProfile<Profile>();
        const merged = {
          ...p,
          first_name: p.first_name ?? local?.first_name ?? null,
          city_name: p.city_name ?? local?.city_name ?? null,
          country_text: local?.country_text ?? null,
        };
        cacheProfile(merged);
        setProfile(merged);
      })
      .catch(() => {});
  }, []);

  if (profileId === null) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold">{b("checklistTitle")}</h1>
        <p className="text-lg">{b("noProfile")}</p>
        <Link href="/onboarding" className="btn btn-primary self-start">
          {b("start")}
        </Link>
      </main>
    );
  }

  const phases = checklistFor(profile);
  const programs = programsFor(profile);
  const all = phases.flatMap((p) => p.items);
  const doneCount = all.filter((i) => done.includes(i.id)).length;
  const current = phases.find((p) => p.items.some((i) => !done.includes(i.id)))?.phase ?? null;
  const expanded = open ?? new Set(current ? [current] : []);
  const togglePhase = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };
  const toggle = (id: string) => {
    const now = !done.includes(id);
    setDoneState(setDone(id, now));
    if (now) track("item_done", locale, id);
  };
  const name = profile?.first_name;
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;

  return (
    <>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-4 pb-32">
        <section aria-labelledby="hello" className="flex flex-col gap-2">
          <h1 id="hello" className="font-display text-3xl font-semibold" dir="auto">
            {name ? b("hello", { name }) : b("helloNoName")}
          </h1>
          <p className="text-lg font-bold">{b("progress", { done: doneCount, total: all.length })}</p>
          <div
            className="h-3 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label={b.text("progress", { done: doneCount, total: all.length })}
            aria-valuemin={0}
            aria-valuemax={all.length}
            aria-valuenow={doneCount}
          >
            <div className="h-full rounded-full bg-brand" style={{ inlineSize: `${pct}%` }} />
          </div>
        </section>

        <section aria-labelledby="checklist-title" className="flex flex-col gap-3">
          <h2 id="checklist-title" className="border-b-4 border-brand pb-1 font-display text-2xl font-bold">
            {b("checklistTitle")}
          </h2>
          {all.length > 0 && doneCount === all.length && <p className="card bg-brand-light font-bold text-brand">{b("allDone")}</p>}
          {phases.map(({ phase, items }) => {
            const isOpen = expanded.has(phase);
            const isCurrent = phase === current;
            const phaseDone = items.filter((i) => done.includes(i.id)).length;
            return (
              <div key={phase} className={`card !p-0 ${isCurrent ? "border-2 border-brand" : ""}`}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`phase-${phase}`}
                    onClick={() => togglePhase(phase)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start"
                  >
                    <span className="flex flex-1 flex-wrap items-center gap-2 text-lg font-bold">
                      {bph(phase)}
                      {isCurrent && <span className="rounded-full bg-brand px-2 py-0.5 text-sm text-white">{b("now")}</span>}
                    </span>
                    <span className="text-sm font-bold text-muted">{b.local("phaseProgress", { done: phaseDone, total: items.length })}</span>
                    <ChevronDown aria-hidden className={`size-6 shrink-0 text-brand ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </h3>
                {isOpen && (
                  <ul id={`phase-${phase}`} className="flex flex-col divide-y divide-line border-t border-line">
                    {items.map((item) => {
                      const isDone = done.includes(item.id);
                      return (
                        <li key={item.id} className="flex items-stretch">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isDone}
                            aria-label={b.local("markDone", { title: tr(item.title, locale) })}
                            onClick={() => toggle(item.id)}
                            className="flex w-16 shrink-0 items-center justify-center"
                          >
                            <span
                              aria-hidden
                              className={`flex size-9 items-center justify-center rounded-lg border-2 ${
                                isDone ? "border-brand bg-brand text-white" : "border-muted bg-surface"
                              }`}
                            >
                              {isDone && <Check className="size-6" strokeWidth={3} />}
                            </span>
                          </button>
                          <Link href={`/item/${item.id}`} className="flex min-h-16 flex-1 items-center gap-2 py-3 pe-3">
                            <Pair
                              en={item.title.en}
                              local={tr(item.title, locale)}
                              className={`flex-1 font-bold ${isDone ? "text-muted line-through" : ""}`}
                            />
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
          <h2 id="programs-title" className="border-b-4 border-brand pb-1 font-display text-2xl font-bold">
            {bp("title")}
          </h2>
          {programs.length === 0 && <p className="card">{bp("none")}</p>}
          <ul className="grid grid-cols-2 gap-2">
            {programs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/item/${p.id}`}
                  className="flex h-full min-h-16 items-center rounded-card border border-line bg-surface px-3 py-2 text-sm leading-snug font-bold hover:border-brand"
                >
                  <Pair en={p.title.en} local={tr(p.title, locale)} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Link href="/end" className="btn btn-secondary min-h-14 self-start">
          <LogOut aria-hidden className="size-5 rtl:-scale-x-100" />
          {b("endSession")}
        </Link>
      </main>

      <Link
        href="/assistant"
        className="fixed end-4 bottom-4 z-30 flex min-h-16 items-center gap-2 rounded-full bg-brand py-1.5 ps-1.5 pe-5 text-lg font-bold text-white shadow-lg hover:bg-brand-hover"
        style={{ marginBlockEnd: "env(safe-area-inset-bottom)" }}
      >
        <span aria-hidden className="flex size-13 items-center justify-center rounded-full bg-white">
          <Avatar state="idle" label="" size={46} bare />
        </span>
        {b("askAba")}
      </Link>
    </>
  );
}

"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Pencil, Sparkles, WifiOff } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ListenButton } from "@/components/ListenButton";
import { ErrorNote } from "@/components/Notices";
import { StepSheet } from "@/components/StepSheet";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { cacheRoadmap, getCachedRoadmap, getProfileId, setProfileId } from "@/lib/storage";
import type { Roadmap, Step } from "@/lib/types";

export default function RoadmapPage() {
  const t = useTranslations("Roadmap");
  const locale = useLocale();
  const format = useFormatter();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noProfile, setNoProfile] = useState(false);
  const [open, setOpen] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const id = getProfileId();
    if (!id) {
      setNoProfile(true);
      return;
    }
    setError(null);
    try {
      const data = await api<Roadmap>(`/roadmap/${id}?lang=${locale}`);
      setRoadmap(data);
      setOffline(false);
      cacheRoadmap(locale, data);
    } catch (err) {
      const code = errorCode(err);
      if (code === "profile_not_found") {
        setProfileId(null);
        setNoProfile(true);
        return;
      }
      const cached = getCachedRoadmap<Roadmap>(locale);
      if (cached) {
        setRoadmap(cached);
        setOffline(true);
      } else setError(code);
    }
  }, [locale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the roadmap from the API (and device cache) on mount
    void load();
  }, [load]);

  const setStatus = async (step: Step, status: Step["status"]) => {
    setBusy(true);
    try {
      await api(`/roadmap/steps/${step.id}`, { method: "PATCH", body: { status } });
      setOpen(null);
      await load();
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  if (noProfile) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-lg">{t("noProfile")}</p>
        <Link href="/onboarding" className="btn btn-primary min-h-14 text-lg">
          {t("start")}
        </Link>
      </main>
    );
  }

  if (!roadmap) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8" aria-busy={!error}>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        {error ? (
          <ErrorNote code={error} onRetry={load} />
        ) : (
          <div className="flex flex-col gap-3" role="status">
            <span className="sr-only">{t("title")}…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-card bg-line/60" />
            ))}
          </div>
        )}
      </main>
    );
  }

  const now = roadmap.steps.find((s) => s.is_now);
  const upcoming = roadmap.steps.filter((s) => s.status === "todo" && !s.is_now);
  const finished = roadmap.steps.filter((s) => s.status !== "todo");
  const pct = roadmap.total ? Math.round((roadmap.done / roadmap.total) * 100) : 0;
  const dateLabel = (d: string) => format.dateTime(new Date(d + "T12:00:00"), { month: "short", day: "numeric" });

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">
          {roadmap.weeks_since_arrival !== null ? t("week", { week: roadmap.weeks_since_arrival + 1 }) : t("firstSteps")}
        </p>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <div className="flex flex-col gap-1.5">
          <div
            className="h-3 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={roadmap.total}
            aria-valuenow={roadmap.done}
            aria-label={t("progress", { done: roadmap.done, total: roadmap.total })}
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-muted">{t("progress", { done: roadmap.done, total: roadmap.total })}</p>
        </div>
        <Link href="/onboarding" className="btn btn-quiet simple-hide self-start !px-0">
          <Pencil aria-hidden className="size-4" />
          {t("edit")}
        </Link>
      </header>

      {offline && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-amber-light p-3 font-bold text-amber-ink">
          <WifiOff aria-hidden className="size-5" />
          {t("offline")}
        </p>
      )}
      {error && roadmap && <ErrorNote code={error} />}

      {now ? (
        <section aria-labelledby="now-title" className="flex flex-col gap-4 rounded-card bg-brand p-5 text-white">
          <p className="flex items-center gap-2 text-sm font-bold tracking-wide uppercase">
            <Sparkles aria-hidden className="size-4" />
            {t("doNow")}
          </p>
          <h2 id="now-title" className="font-display text-2xl leading-tight font-semibold">
            {now.title}
          </h2>
          <p className="text-white/90">{now.summary}</p>
          {now.rule_may_have_changed && (
            <p className="flex gap-2 rounded-xl bg-white/15 p-2 text-sm font-bold">
              <AlertTriangle aria-hidden className="size-4 shrink-0" />
              {t("ruleChanged")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {now.unlocks.map((u) => (
              <span key={u.id} className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
                {t("unlocks", { title: u.title })}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn bg-white text-brand hover:bg-brand-light" onClick={() => setOpen(now)}>
              {t("open")}
              <ChevronRight aria-hidden className="size-5 rtl:-scale-x-100" />
            </button>
            <ListenButton key={now.id} text={`${now.title}. ${now.summary}`} language={locale} label={t("listenAll")} className="!border-white !bg-transparent !text-white" />
          </div>
        </section>
      ) : (
        <p className="card flex items-center gap-2 text-lg font-bold">
          <CheckCircle2 aria-hidden className="size-6 text-brand" />
          {t("allDone")}
        </p>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="coming-title" className="flex flex-col gap-3">
          <h2 id="coming-title" className="text-xl font-bold">
            {t("comingUp")}
          </h2>
          <ol className="flex flex-col gap-2">
            {upcoming.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s)}
                  className="card flex w-full items-center gap-3 !p-4 text-start hover:border-brand"
                >
                  <CircleDashed aria-hidden className="size-6 shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-bold">{s.title}</span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {s.custom && <span className="font-bold text-amber-ink">{t("fromLetter")}</span>}
                      {s.timing_label && <span>{s.timing_label}</span>}
                      {s.due_date && <span>{dateLabel(s.due_date)}</span>}
                    </span>
                    {s.unlocks.length > 0 && (
                      <span className="simple-hide flex flex-wrap gap-1">
                        {s.unlocks.map((u) => (
                          <span key={u.id} className="rounded-full bg-brand-light px-2 py-0.5 text-xs font-bold text-brand">
                            {t("unlocks", { title: u.title })}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  {s.rule_may_have_changed && <AlertTriangle aria-label={t("ruleChanged")} className="size-5 shrink-0 text-amber-ink" />}
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted rtl:-scale-x-100" />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {finished.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            className="btn btn-quiet self-start !px-0"
            aria-expanded={showDone}
            aria-controls="done-list"
            onClick={() => setShowDone(!showDone)}
          >
            <ChevronDown aria-hidden className={`size-5 ${showDone ? "rotate-180" : ""}`} />
            {t("completed", { count: finished.length })}
          </button>
          {showDone && (
            <ul id="done-list" className="flex flex-col gap-2">
              {finished.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpen(s)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-start text-muted hover:bg-surface">
                    <CheckCircle2 aria-hidden className="size-5 shrink-0 text-brand" />
                    <span className={s.status === "done" ? "line-through" : ""}>{s.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <StepSheet step={open} onClose={() => setOpen(null)} onStatus={setStatus} busy={busy} />
    </main>
  );
}

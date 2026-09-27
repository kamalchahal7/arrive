"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ErrorNote } from "@/components/Notices";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getCachedProfile, getProfileId } from "@/lib/storage";
import type { Checklist, Profile } from "@/lib/types";

// First version of the home screen (R2): greeting, progress and the checklist by phase.
export function Home() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (profileId: string) => {
    setError(null);
    try {
      setChecklist(await api<Checklist>(`/checklist/${profileId}?lang=${locale}`));
    } catch (err) {
      setError(errorCode(err));
    }
  }, [locale]);

  useEffect(() => {
    const stored = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the profile ID lives in localStorage, only readable after hydration */
    setId(stored);
    setName(getCachedProfile<Profile>()?.first_name ?? null);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (stored) void load(stored);
  }, [load]);

  if (id === null) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <p className="text-lg">{t("noProfile")}</p>
        <Link href="/onboarding" className="btn btn-primary self-start">
          {t("start")}
        </Link>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
      <h1 className="font-display text-3xl font-semibold">{name ? t("hello", { name }) : t("helloNoName")}</h1>
      {checklist && <p className="text-lg font-bold">{t("progress", { done: checklist.done, total: checklist.total })}</p>}
      {error && <ErrorNote code={error} onRetry={id ? () => void load(id) : undefined} />}
      {checklist?.phases.map((phase) => (
        <section key={phase.id} aria-labelledby={`phase-${phase.id}`} className="flex flex-col gap-2">
          <h2 id={`phase-${phase.id}`} className="eyebrow">
            {phase.label}
          </h2>
          <ul className="card flex flex-col divide-y divide-line !p-0">
            {phase.items.map((row) => (
              <li key={`${row.item_id}:${row.person_key}`} className="flex items-center gap-3 px-4 py-3">
                {row.status === "done" ? (
                  <CheckCircle2 aria-hidden className="size-6 text-teal" />
                ) : (
                  <Circle aria-hidden className="size-6 text-muted" />
                )}
                <span className="flex-1">
                  <span className="block font-bold">{row.title}</span>
                  <span className="text-sm text-muted">{t("forPerson", { person: row.person_label })}</span>
                </span>
                {row.essential && <span className="rounded-full bg-amber-light px-2 py-0.5 text-sm font-bold text-amber-ink">{t("essential")}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

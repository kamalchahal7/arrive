"use client";

// All programs for the family (docs/REDESIGN.md 7.3), filtered by group. The backend already hides programs that
// do not fit the household (children, seniors, disability).

import { ArrowLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ErrorNote } from "@/components/Notices";
import { Link } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { getProfileId } from "@/lib/storage";
import type { Programs } from "@/lib/types";

export function ProgramsList() {
  const t = useTranslations("Programs");
  const locale = useLocale();
  const [data, setData] = useState<Programs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<string>("all");

  useEffect(() => {
    const pid = getProfileId();
    if (!pid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no profile on this phone
      setError("profile_not_found");
      return;
    }
    api<Programs>(`/programs/${pid}?lang=${locale}`).then(setData, (e) => setError(errorCode(e)));
  }, [locale]);

  const groups = data ? [...new Set(data.programs.map((p) => p.group))] : [];
  const shown = data?.programs.filter((p) => group === "all" || p.group === group) ?? [];

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted">{t("intro")}</p>
      {error && <ErrorNote code={error} />}
      {data?.notes.map((n) => (
        <p key={n} className="card bg-teal-light">
          {n}
        </p>
      ))}
      {groups.length > 1 && (
        <div role="group" aria-label={t("filter")} className="flex flex-wrap gap-2">
          {["all", ...groups].map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={`min-h-11 rounded-full border-2 px-4 font-bold ${
                group === g ? "border-teal bg-teal text-white" : "border-line bg-surface"
              }`}
            >
              {g === "all" ? t("all") : t(`group.${g}`)}
            </button>
          ))}
        </div>
      )}
      {data && shown.length === 0 && <p className="card">{t("none")}</p>}
      <ul className="flex flex-col gap-3">
        {shown.map((p) => (
          <li key={p.id}>
            <Link href={`/item/${p.id}`} className="card flex items-center gap-3 hover:border-teal">
              <span className="flex flex-1 flex-col gap-1">
                <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                  <span className="rounded-full bg-teal-light px-2 py-0.5 text-teal">{t(`group.${p.group}`)}</span>
                  <span className="rounded-full bg-ground px-2 py-0.5 text-muted">{t(`level.${p.level}`)}</span>
                </span>
                <span className="text-lg font-bold">{p.title}</span>
                <span className="text-muted">{p.summary}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted rtl:-scale-x-100" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

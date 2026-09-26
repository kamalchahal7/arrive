"use client";

import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { use, useCallback, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppShell";
import { ErrorNote } from "@/components/Notices";
import { Link } from "@/i18n/navigation";
import { isRtl } from "@/i18n/routing";
import { api, errorCode } from "@/lib/api";
import type { CardSide, StaffCard } from "@/lib/types";

function Side({ side, big }: { side: CardSide; big: boolean }) {
  return (
    <div lang={side.language} dir={isRtl(side.language) ? "rtl" : "ltr"} className="flex flex-col gap-3">
      <p className={big ? "text-3xl" : "text-xl"}>{side.greeting}</p>
      <p className={`${big ? "text-2xl" : "text-lg"} text-muted`}>{side.purpose_label}</p>
      <p className={`${big ? "text-4xl" : "text-2xl"} font-bold leading-tight`}>{side.purpose}</p>
      {side.documents.length > 0 && (
        <>
          <p className={`${big ? "text-2xl" : "text-lg"} text-muted`}>{side.documents_label}</p>
          <ul className="flex flex-col gap-1.5">
            {side.documents.map((d) => (
              <li key={d} className={`flex gap-2 ${big ? "text-2xl" : "text-lg"}`}>
                <Check aria-hidden className="mt-1.5 size-5 shrink-0 text-teal" />
                {d}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={big ? "text-xl" : "text-base"}>{side.language_note}</p>
      <p className={big ? "text-xl" : "text-base"}>{side.thanks}</p>
    </div>
  );
}

export default function StaffCardPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = use(params);
  const t = useTranslations("StaffCard");
  const locale = useLocale();
  const [card, setCard] = useState<StaffCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCard(
        await api<StaffCard>("/staff-card", {
          method: "POST",
          body: { step_id: stepId, language: locale, official_language: locale === "fr" ? "fr" : "en" },
        }),
      );
    } catch (err) {
      setError(errorCode(err));
    }
  }, [stepId, locale]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the card from the API on mount
    void load();
  }, [load]);

  const sameLanguage = card && card.official.language === card.native.language;

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/roadmap" className="btn btn-quiet !px-0">
            <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
            {t("back")}
          </Link>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setScale(Math.max(1, scale - 1))} disabled={scale === 1}>
              <Minus aria-hidden className="size-5" />
              {t("smaller")}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setScale(Math.min(2, scale + 1))} disabled={scale === 2}>
              <Plus aria-hidden className="size-5" />
              {t("bigger")}
            </button>
          </div>
        </div>
        <h1 className="sr-only">{t("title")}</h1>

        {error && <ErrorNote code={error} onRetry={load} />}
        {!card && !error && <div role="status" className="h-64 animate-pulse rounded-card bg-line/60" />}

        {card && (
          <>
            <section className="rounded-card border-4 border-teal bg-surface p-6" aria-label={t("forStaff")}>
              <p className="eyebrow mb-3">{t("forStaff")}</p>
              <Side side={card.official} big={scale === 2} />
            </section>
            {!sameLanguage && (
              <section className="rounded-card bg-teal-light p-6" aria-label={t("forYou")}>
                <p className="eyebrow mb-3">{t("forYou")}</p>
                <Side side={card.native} big={scale === 2} />
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

"use client";

import { AlertTriangle, Check, ClipboardList, IdCard, MapPin, RotateCcw, SkipForward, X } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type { Step } from "@/lib/types";
import { ListenButton } from "./ListenButton";
import { SourceLink } from "./Sources";

// Native <dialog>: focus is trapped, Escape closes, and focus returns to the opener.
export function StepSheet({
  step,
  onClose,
  onStatus,
  busy,
}: {
  step: Step | null;
  onClose: () => void;
  onStatus: (step: Step, status: Step["status"]) => void;
  busy: boolean;
}) {
  const t = useTranslations("Roadmap");
  const tc = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (step && !d.open) d.showModal();
    if (!step && d.open) d.close();
  }, [step]);

  const spoken = step
    ? [step.title, step.summary, step.documents.length ? `${t("bring")}: ${step.documents.join(", ")}` : "", step.where]
        .filter(Boolean)
        .join(". ")
    : "";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="step-title"
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl bg-surface p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {step && (
        <div className="flex flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="step-title" className="font-display text-2xl leading-tight font-semibold">
              {step.title}
            </h2>
            <button type="button" onClick={onClose} className="btn btn-quiet !px-2" aria-label={tc("close")}>
              <X aria-hidden className="size-6" />
            </button>
          </div>

          {step.rule_may_have_changed && (
            <p role="alert" className="flex gap-2 rounded-xl bg-amber-light p-3 font-bold text-amber-ink">
              <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
              {t("ruleChanged")}
            </p>
          )}

          <ListenButton key={step.id} text={spoken} language={locale} />

          <section className="flex flex-col gap-1">
            <h3 className="eyebrow">{t("what")}</h3>
            <p>{step.summary}</p>
          </section>

          {!step.custom && (
            <section className="flex flex-col gap-2">
              <h3 className="eyebrow flex items-center gap-1.5">
                <ClipboardList aria-hidden className="size-4" />
                {t("bring")}
              </h3>
              {step.documents.length ? (
                <ul className="flex flex-col gap-1.5">
                  {step.documents.map((d) => (
                    <li key={d} className="flex gap-2">
                      <Check aria-hidden className="mt-1 size-4 shrink-0 text-teal" />
                      {d}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{t("noDocuments")}</p>
              )}
            </section>
          )}

          {step.where && (
            <section className="flex flex-col gap-1">
              <h3 className="eyebrow flex items-center gap-1.5">
                <MapPin aria-hidden className="size-4" />
                {t("where")}
              </h3>
              <p>{step.where}</p>
            </section>
          )}

          {(step.timing_label || step.due_date) && (
            <section className="flex flex-col gap-1">
              <h3 className="eyebrow">{t("when")}</h3>
              {step.timing_label && <p>{step.timing_label}</p>}
              {step.due_date && (
                <p className="font-bold">
                  {t("due", { date: format.dateTime(new Date(step.due_date + "T12:00:00"), { dateStyle: "long" }) })}
                </p>
              )}
            </section>
          )}

          {step.source && (
            <section className="flex flex-col gap-1 border-t border-line pt-3">
              <h3 className="eyebrow">{tc("source")}</h3>
              <SourceLink title={step.source.title || step.source.url} url={step.source.url} lastChecked={step.source.last_checked} />
            </section>
          )}
          {!step.custom && !step.reviewed && <p className="simple-hide text-sm text-muted">{t("draft")}</p>}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {step.status === "done" ? (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onStatus(step, "todo")}>
                <RotateCcw aria-hidden className="size-5" />
                {t("markNotDone")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onStatus(step, "done")}>
                <Check aria-hidden className="size-5" />
                {t("markDone")}
              </button>
            )}
            {!step.custom && (
              <Link href={`/staff-card/${step.id}`} className="btn btn-secondary">
                <IdCard aria-hidden className="size-5" />
                {t("showStaff")}
              </Link>
            )}
            {step.status === "todo" && (
              <button type="button" className="btn btn-quiet simple-hide" disabled={busy} onClick={() => onStatus(step, "skipped")}>
                <SkipForward aria-hidden className="size-5 rtl:-scale-x-100" />
                {t("skip")}
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

"use client";

import { ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { saveDraft } from "@/lib/handoff-draft";
import type { AskResponse } from "@/lib/types";
import { ListenButton } from "./ListenButton";
import { EmergencyCard, HandoffCard } from "./Notices";
import { SourceList } from "./Sources";

export function AnswerCard({
  question,
  res,
  autoRead,
  onFollowUp,
}: {
  question: string;
  res: AskResponse;
  autoRead: boolean;
  onFollowUp: (q: string) => void;
}) {
  const t = useTranslations("Ask");
  const locale = useLocale();
  const [rated, setRated] = useState<1 | -1 | null>(null);
  const lang = res.language || locale;
  const text = res.answer || res.message || "";
  const spoken = [res.emergency_message, text, ...res.steps].filter(Boolean).join(". ");

  const rate = async (clarity: 1 | -1) => {
    setRated(clarity);
    if (res.request_id) {
      try {
        await api("/feedback", { method: "POST", body: { request_id: res.request_id, clarity } });
      } catch {
        /* feedback is best effort */
      }
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {res.emergency && res.emergency_message && <EmergencyCard message={res.emergency_message} />}

      <article className="card flex flex-col gap-4" lang={lang} dir="auto">
        <p className="text-lg">{text}</p>
        {res.steps.length > 0 && (
          <ol className="flex list-decimal flex-col gap-1.5 ps-6">
            {res.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {res.possible_scam && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-light p-3 font-bold text-danger-ink">
            <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            <span>
              {t("scamWarning")}{" "}
              <Link href="/scam-check" className="underline">
                {t("checkScam")}
              </Link>
            </span>
          </p>
        )}
        <div>
          <ListenButton text={spoken} language={lang} autoPlay={autoRead} />
        </div>
        <SourceList sources={res.sources} heading={t("sources")} />
        {res.disclaimer && <p className="simple-hide text-sm text-muted">{res.disclaimer}</p>}

        {res.status === "answered" && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {rated ? (
              <p role="status" className="text-muted">
                {t("thanks")}
              </p>
            ) : (
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="mb-2 font-bold">{t("wasClear")}</legend>
                <button type="button" className="btn btn-secondary !min-h-11 !py-1.5" onClick={() => rate(1)}>
                  <ThumbsUp aria-hidden className="size-5" />
                  {t("clearYes")}
                </button>
                <button type="button" className="btn btn-secondary !min-h-11 !py-1.5" onClick={() => rate(-1)}>
                  <ThumbsDown aria-hidden className="size-5" />
                  {t("clearNo")}
                </button>
              </fieldset>
            )}
          </div>
        )}
      </article>

      {res.handoff_suggested && (
        <div onClickCapture={() => saveDraft({ need: question, topic: res.topic, requestId: res.request_id })}>
          <HandoffCard
            title={t("handoffTitle")}
            body={t(`handoff_${res.handoff_reason || "not_found"}`)}
            href="/help"
            button={t("handoffButton")}
          />
        </div>
      )}

      {res.follow_ups.length > 0 && (
        <div className="simple-hide flex flex-col gap-2">
          <p className="eyebrow">{t("followUps")}</p>
          <div className="flex flex-wrap gap-2">
            {res.follow_ups.map((f) => (
              <button
                key={f}
                type="button"
                dir="auto"
                onClick={() => onFollowUp(f)}
                className="min-h-11 rounded-full border-2 border-teal bg-surface px-4 py-2 text-start font-bold text-teal hover:bg-teal-light"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

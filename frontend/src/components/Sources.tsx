import { ExternalLink } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { SourceRef } from "@/lib/types";

export function SourceLink({ title, url, lastChecked }: { title: string; url: string; lastChecked: string | null }) {
  const t = useTranslations("Common");
  const format = useFormatter();
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();
  return (
    <div className="flex flex-col gap-0.5">
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1.5 font-bold text-brand underline underline-offset-2">
        <span dir="auto">{title}</span>
        <ExternalLink aria-hidden className="mt-1 size-4 shrink-0" />
        <span className="sr-only">{t("opensNewTab")}</span>
      </a>
      <span className="text-sm text-muted">
        <span dir="ltr">{host}</span>
        {lastChecked && (
          <>
            {" · "}
            {t("lastChecked", { date: format.dateTime(new Date(lastChecked.length === 10 ? `${lastChecked}T12:00:00` : lastChecked), { dateStyle: "medium" }) })}
          </>
        )}
      </span>
    </div>
  );
}

export function SourceList({ sources, heading }: { sources: SourceRef[]; heading: string }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 className="eyebrow">{heading}</h3>
      <ul className="flex flex-col gap-2">
        {sources.map((s) => (
          <li key={s.source_id}>
            <SourceLink title={s.title} url={s.url} lastChecked={s.last_checked} />
          </li>
        ))}
      </ul>
    </div>
  );
}

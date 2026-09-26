"use client";

import { AlertTriangle, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ErrorNote({ code, onRetry }: { code: string; onRetry?: () => void }) {
  const t = useTranslations("Errors");
  const tc = useTranslations("Common");
  const known = t.has(code) ? code : "internal_error";
  return (
    <div role="alert" className="card flex flex-col gap-3 border-danger-ink/30 bg-danger-light text-danger-ink">
      <p className="flex items-start gap-2 font-bold">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0" />
        {t(known)}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-secondary self-start">
          {tc("retry")}
        </button>
      )}
    </div>
  );
}

export function HandoffCard({
  title,
  body,
  href,
  button,
}: {
  title: string;
  body: string;
  href: string;
  button: string;
}) {
  return (
    <section className="card flex flex-col gap-3 border-amber-ink/25 bg-amber-light text-amber-ink">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <UserRound aria-hidden className="size-6 shrink-0" />
        {title}
      </h3>
      <p>{body}</p>
      <Link href={href} className="btn btn-primary self-start">
        {button}
      </Link>
    </section>
  );
}

export function EmergencyCard({ message }: { message: string }) {
  const t = useTranslations("Ask");
  return (
    <section role="alert" className="card flex flex-col gap-3 border-danger-ink bg-danger-light text-danger-ink">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <AlertTriangle aria-hidden className="size-6 shrink-0" />
        {t("emergencyTitle")}
      </h3>
      <p className="font-bold">{message}</p>
      <a href="tel:911" className="btn btn-primary self-start !bg-danger-ink">
        <Phone aria-hidden className="size-5" />
        {t("call911")}
      </a>
    </section>
  );
}

"use client";

import { IdCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Link } from "@/i18n/navigation";

// Home header (docs/REDESIGN.md section 6): ID card button at the start, the name, the language switcher at the end.
export function HomeHeader() {
  const t = useTranslations("Home");
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2">
        <Link href="/id" className="btn btn-secondary justify-self-start !min-h-11 !px-3">
          <IdCard aria-hidden className="size-6" />
          <span className="text-sm">{t("idButton")}</span>
        </Link>
        <Link href="/home" lang="en" className="font-display text-2xl font-semibold text-teal">
          Arrive
        </Link>
        <div className="justify-self-end">
          <LanguageSwitcher compact />
        </div>
      </div>
    </header>
  );
}

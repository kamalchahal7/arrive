"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LANGUAGE_NAMES, routing } from "@/i18n/routing";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2">
      <Languages aria-hidden className="size-5 text-teal" />
      <span className={compact ? "sr-only" : "font-bold"}>{t("language")}</span>
      <select
        className="field !min-h-11 !w-auto !py-1.5 font-bold"
        value={locale}
        disabled={pending}
        onChange={(e) => startTransition(() => router.replace(pathname, { locale: e.target.value }))}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

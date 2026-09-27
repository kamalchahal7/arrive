"use client";

import { Globe2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { LANGUAGES } from "@/config/languages";
import { Link } from "@/i18n/navigation";
import { getProfileId } from "@/lib/storage";

// The first screen (docs/REDESIGN.md 4.1): large buttons with each language's name in its own script.
// People who already have a checklist on this phone go straight back to it in the language they pick.
export function LanguageScreen() {
  const t = useTranslations("Language");
  const hasProfile = useSyncExternalStore(
    () => () => {},
    () => Boolean(getProfileId()),
    () => false,
  );
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-display text-3xl font-semibold text-brand" lang="en">
          Arrive
        </p>
        <Globe2 aria-hidden className="size-12 text-brand" />
        <h1 className="text-xl font-bold">{t("title")}</h1>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {LANGUAGES.map((l) => (
          <li key={l.code}>
            <Link
              href={hasProfile ? "/home" : "/onboarding"}
              locale={l.code}
              lang={l.code}
              dir={l.dir}
              className="flex min-h-20 items-center justify-center rounded-card border-2 border-line bg-surface px-5 py-3 text-3xl font-bold hover:border-brand hover:bg-brand-light"
            >
              {l.nativeName}
            </Link>
          </li>
        ))}
      </ul>
      {hasProfile && <p className="text-center text-muted">{t("saved")}</p>}
    </main>
  );
}

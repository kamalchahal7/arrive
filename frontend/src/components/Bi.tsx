"use client";

// Bilingual labels: English and the person's language side by side ("Gender / الجنس"), so an English-speaking
// helper can guide the person. In English only the English text shows.

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { languageInfo } from "@/config/languages";

type Values = Record<string, string | number>;

/** English + local text for any pair of strings (e.g. data with a text per language). */
export function Pair({ en, local, className = "" }: { en: string; local: string; className?: string }) {
  const locale = useLocale();
  if (locale === "en" || en === local) return <span className={className}>{en}</span>;
  return (
    <span className={className}>
      <bdi lang="en" dir="ltr">
        {en}
      </bdi>
      <span aria-hidden className="mx-1.5 font-normal opacity-60">
        /
      </span>
      <bdi lang={locale} dir={languageInfo(locale).dir}>
        {local}
      </bdi>
    </span>
  );
}

/** `b("key")` renders the message as English / local; `b.local("key")` and `b.en("key")` give plain strings. */
export function useBi(namespace: string) {
  const t = useTranslations(namespace);
  const en = useTranslations(`EN.${namespace}`);
  return Object.assign((key: string, values?: Values): ReactNode => <Pair en={en(key, values)} local={t(key, values)} />, {
    local: (key: string, values?: Values) => t(key, values),
    en: (key: string, values?: Values) => en(key, values),
    /** "English / local" as one string, for aria labels. */
    text: (key: string, values?: Values) => {
      const a = en(key, values);
      const l = t(key, values);
      return a === l ? a : `${a} / ${l}`;
    },
  });
}

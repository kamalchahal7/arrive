import { defineRouting } from "next-intl/routing";
import { LANGUAGES, LOCALES } from "@/config/languages";

// Locales come from src/config/languages.ts. Each needs messages/<locale>.json with the same keys as en.json.
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
});

// Language names are always written in their own language.
export const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.nativeName]));

export type AppLocale = (typeof routing.locales)[number];

// "fa" (Farsi) is not an app locale but appears in older content, such as the welcome greetings.
const RTL_LOCALES: readonly string[] = [...LANGUAGES.filter((l) => l.dir === "rtl").map((l) => l.code), "fa"];

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(locale);
}

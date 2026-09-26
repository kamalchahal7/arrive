import { defineRouting } from "next-intl/routing";

// Add a locale here, add messages/<locale>.json, and (if right-to-left) add it to RTL_LOCALES.
export const routing = defineRouting({
  locales: ["en", "fr", "ar"],
  defaultLocale: "en",
});

export type AppLocale = (typeof routing.locales)[number];

const RTL_LOCALES: readonly string[] = ["ar", "fa"];

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.includes(locale);
}

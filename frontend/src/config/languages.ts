// The app's six languages, in the order the language screen shows them. Add a language here, add
// messages/<code>.json with the same keys as en.json (npm run check:messages), and the routing, text direction and
// language pickers follow. Keep speech support in step with backend/app/services/speech.py.
// All six are spoken and understood by ElevenLabs (the Aba agent's language list and eleven_multilingual_v2).
// This file has no "use client": server and client components both import it.

export type LanguageInfo = {
  code: string;
  englishName: string;
  /** The language's name in its own script. */
  nativeName: string;
  dir: "ltr" | "rtl";
  /** Questions and answers can be read aloud. */
  tts: boolean;
  /** Answers can be spoken (speech-to-text). */
  stt: boolean;
  script: "latin" | "arabic" | "devanagari" | "han";
  /** Locale for browser Intl APIs (names of countries and languages, dates). */
  intl: string;
};

export const LANGUAGES = [
  { code: "en", englishName: "English", nativeName: "English", dir: "ltr", tts: true, stt: true, script: "latin", intl: "en-CA" },
  { code: "fr", englishName: "French", nativeName: "Français", dir: "ltr", tts: true, stt: true, script: "latin", intl: "fr-CA" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", dir: "rtl", tts: true, stt: true, script: "arabic", intl: "ar" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी", dir: "ltr", tts: true, stt: true, script: "devanagari", intl: "hi" },
  { code: "zh", englishName: "Mandarin", nativeName: "中文", dir: "ltr", tts: true, stt: true, script: "han", intl: "zh-CN" },
  { code: "es", englishName: "Spanish", nativeName: "Español", dir: "ltr", tts: true, stt: true, script: "latin", intl: "es" },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LOCALES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// Names used on the staff page (English) for each app language.
export const OTHER_LANGUAGES: readonly { code: string; englishName: string; nativeName: string }[] = LANGUAGES;

/** The Intl locale for an app locale ("zh" -> "zh-CN"); other codes pass through. */
export function intlLocale(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.intl ?? code;
}

function displayName(type: "language" | "region", code: string, inLocale: string): string | null {
  try {
    const names = new Intl.DisplayNames([intlLocale(inLocale)], { type, fallback: "none" });
    // Browsers without data for a locale quietly answer in their default language; only trust a matching locale.
    const resolved = names.resolvedOptions().locale.split("-")[0];
    if (resolved !== intlLocale(inLocale).split("-")[0]) return null;
    const name = names.of(code);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

/** A language's name for someone reading `inLocale` (e.g. French names on the staff card). English as fallback. */
export function languageName(code: string, inLocale: string): string {
  const known = OTHER_LANGUAGES.find((l) => l.code === code);
  if (inLocale === "en" && known) return known.englishName;
  return displayName("language", code, inLocale) ?? known?.englishName ?? code;
}

/** A country's name (ISO 3166-1 alpha-2) for someone reading `inLocale`, with English as fallback. */
export function countryName(code: string, inLocale: string): string {
  return displayName("region", code, inLocale) ?? displayName("region", code, "en") ?? code;
}

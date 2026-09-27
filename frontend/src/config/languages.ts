// The app's languages (docs/REDESIGN.md section 3). Add a language here, add messages/<code>.json with the same keys
// as en.json (npm run check:messages), and the routing, text direction and language pickers follow.
// Keep speech support in step with backend/app/services/speech.py.
//
// Speech support from the ElevenLabs docs, checked 2026-09-26:
//   speech-to-text (Scribe v2): elevenlabs.io/docs/overview/capabilities/speech-to-text
//   text-to-speech models:      elevenlabs.io/docs/models
// - Dari is not in either list (Persian is). Dari stays in text mode until a Dari speaker has tested the Persian
//   models [VERIFY]. Tigrinya is not in either list.
// - Pashto speech-to-text is listed. Pashto read-aloud needs the backend's ELEVENLABS_TTS_MODEL_EXTENDED (a model
//   such as eleven_v3); without it the app falls back to text for the questions.
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
  script: "latin" | "arabic" | "ethiopic";
  /** Locale for browser Intl APIs (names of countries and languages, dates). Dari is "fa-AF" in CLDR. */
  intl: string;
};

export const LANGUAGES = [
  { code: "en", englishName: "English", nativeName: "English", dir: "ltr", tts: true, stt: true, script: "latin", intl: "en-CA" },
  { code: "fr", englishName: "French", nativeName: "Français", dir: "ltr", tts: true, stt: true, script: "latin", intl: "fr-CA" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية", dir: "rtl", tts: true, stt: true, script: "arabic", intl: "ar" },
  { code: "prs", englishName: "Dari", nativeName: "دری", dir: "rtl", tts: false, stt: false, script: "arabic", intl: "fa-AF" },
  { code: "ps", englishName: "Pashto", nativeName: "پښتو", dir: "rtl", tts: true, stt: true, script: "arabic", intl: "ps" },
  { code: "ti", englishName: "Tigrinya", nativeName: "ትግርኛ", dir: "ltr", tts: false, stt: false, script: "ethiopic", intl: "ti" },
] as const satisfies readonly LanguageInfo[];

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LOCALES = LANGUAGES.map((l) => l.code) as [LanguageCode, ...LanguageCode[]];

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

// Other languages a person can say they speak (the staff card asks for an interpreter in these).
// Keep in step with SpokenLanguage in backend/app/services/onboarding.py.
export const OTHER_LANGUAGES: readonly { code: string; englishName: string; nativeName: string }[] = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية" },
  { code: "prs", englishName: "Dari", nativeName: "دری" },
  { code: "ps", englishName: "Pashto", nativeName: "پښتو" },
  { code: "ti", englishName: "Tigrinya", nativeName: "ትግርኛ" },
  { code: "fa", englishName: "Persian (Farsi)", nativeName: "فارسی" },
  { code: "ur", englishName: "Urdu", nativeName: "اردو" },
  { code: "ku", englishName: "Kurdish", nativeName: "Kurdî / کوردی" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe" },
  { code: "so", englishName: "Somali", nativeName: "Soomaali" },
  { code: "am", englishName: "Amharic", nativeName: "አማርኛ" },
  { code: "om", englishName: "Oromo", nativeName: "Afaan Oromoo" },
  { code: "sw", englishName: "Swahili", nativeName: "Kiswahili" },
  { code: "rw", englishName: "Kinyarwanda", nativeName: "Ikinyarwanda" },
  { code: "ln", englishName: "Lingala", nativeName: "Lingála" },
  { code: "uk", englishName: "Ukrainian", nativeName: "Українська" },
  { code: "ru", englishName: "Russian", nativeName: "Русский" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "uz", englishName: "Uzbek", nativeName: "Oʻzbekcha" },
  { code: "tg", englishName: "Tajik", nativeName: "Тоҷикӣ" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी" },
  { code: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "bn", englishName: "Bengali", nativeName: "বাংলা" },
  { code: "ta", englishName: "Tamil", nativeName: "தமிழ்" },
  { code: "my", englishName: "Burmese", nativeName: "မြန်မာ" },
  { code: "ne", englishName: "Nepali", nativeName: "नेपाली" },
  { code: "zh", englishName: "Chinese", nativeName: "中文" },
];

/** The Intl locale for an app locale ("prs" -> "fa-AF"); other codes pass through. */
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

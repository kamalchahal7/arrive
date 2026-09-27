// Shared shapes for the hardcoded Ottawa data (src/data/checklist.ts, src/data/programs.ts).
// Source of truth: "Arrive — Ottawa Hardcode Reference" (Sep 26, 2026). Addresses, phones and hours stay in English.

export type Lang = "en" | "fr" | "ar" | "hi" | "zh" | "es";
/** One text in the six app languages. */
export type T = Record<Lang, string>;

export type Place = {
  name: string;
  /** A street address, or a short English note when there is no office to visit (then `map` is false). */
  address: string | null;
  phone: string | null;
  hours: string | null;
  /** Show the "Open Google Maps" button. */
  map: boolean;
};

/** Who an item or program is for. Everything else applies to every household. */
export type Who = "everyone" | "kids" | "kids_0_5" | "kids_6_17" | "seniors" | "disability";

export type Source = { url: string; title: string };

/** Pick the text for a locale, falling back to English. */
export function tr(text: T, locale: string): string {
  return text[locale as Lang] ?? text.en;
}

/** Google Maps search link for a place (opens the app on phones). */
export function mapsUrl(place: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name}, ${place.address ?? ""}, Ottawa`)}`;
}

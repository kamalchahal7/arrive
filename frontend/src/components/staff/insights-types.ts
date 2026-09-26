// A count is a number, or a string like "<5" when the group is too small to show.
export type Count = number | string;

export type Overview = {
  has_sample_data: boolean;
  min_group_size: number;
  cards: {
    total_this_week: Count;
    total_change_pct: number | null;
    answered_rate: number | null;
    handoffs: Count;
    scam_flags: Count;
    top_language: string | null;
  };
  top_topics: { topic: string; label: string; this_week: Count; last_week: Count; change_pct: number | null; spike: boolean }[];
  channel_mix: { channel: string; count: Count }[];
  languages_this_week: { language: string; count: Count }[];
};

export type OverTime = { weeks: { week: string; total: Count; answered: Count; handed_off: Count }[] };
export type Languages = {
  languages: string[];
  weeks: ({ week: string } & Record<string, Count>)[];
  by_region: { region: string; languages: { language: string; count: Count }[] }[];
};
export type Gaps = { days: number; themes: { theme: string; count: Count; topics: string[]; examples: string[] }[] };
export type Confusing = { sources: { title: string; url: string; uses: Count; unclear: Count; unclear_rate: number | null }[] };

export const num = (c: Count): number => (typeof c === "number" ? c : 0);
export const show = (c: Count): string => (typeof c === "number" ? c.toLocaleString("en-CA") : c);

const LANG = new Intl.DisplayNames(["en"], { type: "language" });
export const langName = (code: string): string => {
  try {
    return LANG.of(code) || code;
  } catch {
    return code;
  }
};

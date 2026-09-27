import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import legacy from "../../messages/legacy/en.json";
import en from "../../messages/en.json";
import { routing } from "./routing";

type Tree = { [key: string]: string | Tree };

function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = typeof v === "object" && typeof b === "object" ? merge(b, v) : v;
  }
  return out;
}

// English under "EN" gives every label its English twin (components/Bi.tsx), so an English-speaking helper can
// guide the person. Older, hidden pages only have English text (messages/legacy/en.json) and fall back to it.
const english = merge(legacy as Tree, en as Tree);

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const own = (await import(`../../messages/${locale}.json`)).default as Tree;

  return {
    locale,
    messages: { ...merge(english, own), EN: english },
  };
});

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Phase 0 placeholder. The full welcome screen (voice button, call line, onboarding) is built in Phase 4.

// Greetings are shown in their own language, so each carries its own lang tag. [VERIFY: native speaker review]
const GREETINGS = [
  { lang: "en", text: "Welcome" },
  { lang: "fr", text: "Bienvenue" },
  { lang: "ar", text: "أهلاً وسهلاً" },
  { lang: "fa", text: "خوش آمدید" },
  { lang: "es", text: "Bienvenidos" },
  { lang: "uk", text: "Ласкаво просимо" },
];

// Language names are always written in their own language.
const LANGUAGE_NAMES: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

export default function WelcomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Welcome");

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-bold tracking-wide text-teal">Arrive</p>
        <h1 className="font-display text-4xl leading-tight font-semibold">{t("title")}</h1>
        <p className="text-lg text-muted">{t("subtitle")}</p>
        <ul className="flex flex-wrap gap-2" aria-label={t("greetingsLabel")}>
          {GREETINGS.map((g) => (
            <li
              key={g.lang}
              lang={g.lang}
              dir={g.lang === "ar" || g.lang === "fa" ? "rtl" : "ltr"}
              className="rounded-full border border-line bg-surface px-3 py-1 text-sm"
            >
              {g.text}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="choose-language" className="flex flex-col gap-3">
        <h2 id="choose-language" className="text-xl font-bold">
          {t("chooseLanguage")}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {routing.locales.map((l) => {
            const current = l === locale;
            return (
              <li key={l}>
                <Link
                  href="/"
                  locale={l}
                  lang={l}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 items-center justify-between gap-2 rounded-card border-2 px-4 py-3 text-lg font-bold ${
                    current
                      ? "border-teal bg-teal-light text-teal"
                      : "border-line bg-surface hover:border-teal"
                  }`}
                >
                  {LANGUAGE_NAMES[l]}
                  <ArrowRight aria-hidden className="size-5 shrink-0 rtl:-scale-x-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="flex items-start gap-3 rounded-card bg-teal-light p-4 text-ink">
        <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-teal" />
        <span>{t("privacy")}</span>
      </p>
    </main>
  );
}

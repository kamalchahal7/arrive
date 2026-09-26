import { ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppShell";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { WelcomeContinue } from "@/components/WelcomeContinue";
import { Link } from "@/i18n/navigation";
import { LANGUAGE_NAMES, routing } from "@/i18n/routing";

// Greetings are shown in their own language, so each carries its own lang tag. [VERIFY: native speaker review]
const GREETINGS = [
  { lang: "en", text: "Welcome" },
  { lang: "fr", text: "Bienvenue" },
  { lang: "ar", text: "أهلاً وسهلاً" },
  { lang: "fa", text: "خوش آمدید" },
  { lang: "es", text: "Bienvenidos" },
  { lang: "uk", text: "Ласкаво просимо" },
];

export default async function WelcomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Welcome");

  return (
    <>
      <AppHeader />
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-8 px-5 py-8">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-4xl leading-tight font-semibold">{t("title")}</h1>
          <p className="text-lg text-muted">{t("subtitle")}</p>
          <ul className="simple-hide flex flex-wrap gap-2" aria-label={t("greetingsLabel")}>
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
                    aria-current={current ? "true" : undefined}
                    className={`flex min-h-16 items-center justify-between gap-2 rounded-card border-2 px-5 py-3 text-xl font-bold ${
                      current ? "border-teal bg-teal-light text-teal" : "border-line bg-surface hover:border-teal"
                    }`}
                  >
                    {LANGUAGE_NAMES[l]}
                    {current && <ShieldCheck aria-hidden className="size-6 shrink-0" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <WelcomeContinue continueLabel={t("continue")} roadmapLabel={t("myRoadmap")} />

        <section aria-labelledby="speak" className="card flex flex-col gap-3">
          <h2 id="speak" className="text-lg font-bold">
            {t("orSpeak")}
          </h2>
          <VoiceAssistant />
        </section>

        <p className="flex items-start gap-3 rounded-card bg-teal-light p-4">
          <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-teal" />
          <span>{t("privacy")}</span>
        </p>
      </main>
    </>
  );
}

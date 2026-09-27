import { BadgeCheck, EyeOff, FileSearch, Mic, Scale, Trash2, Users } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const SECTIONS = [
  { icon: FileSearch, title: "sourcesTitle", body: "sourcesBody" },
  { icon: Scale, title: "adviceTitle", body: "adviceBody" },
  { icon: BadgeCheck, title: "loggedTitle", body: "loggedBody", extra: "groupsBody" },
  { icon: EyeOff, title: "notLoggedTitle", body: "notLoggedBody" },
  { icon: Mic, title: "voiceTitle", body: "voiceBody" },
  { icon: Trash2, title: "deleteTitle", body: "deleteBody", link: "/settings" },
] as const;

export default async function TrustPage({ params }: PageProps<"/[locale]/trust">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Trust");
  const tc = await getTranslations("Common");

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="flex items-center gap-2 rounded-card bg-brand-light p-4 text-lg font-bold">
        <Users aria-hidden className="size-6 shrink-0 text-brand" />
        {t("status")}
      </p>
      {SECTIONS.map(({ icon: Icon, title, body, ...rest }) => (
        <section key={title} className="card flex flex-col gap-2" aria-labelledby={title}>
          <h2 id={title} className="flex items-center gap-2 text-lg font-bold">
            <Icon aria-hidden className="size-6 shrink-0 text-brand" />
            {t(title)}
          </h2>
          <p>{t(body)}</p>
          {"extra" in rest && <p className="text-muted">{t(rest.extra)}</p>}
          {"link" in rest && (
            <Link href={rest.link} className="btn btn-secondary self-start">
              {tc("settings")}
            </Link>
          )}
        </section>
      ))}
    </main>
  );
}

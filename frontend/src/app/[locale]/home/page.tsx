import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppShell";
import { Home } from "@/components/home/Home";

export async function generateMetadata({ params }: PageProps<"/[locale]/home">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return { title: t("title") };
}

export default async function HomePage({ params }: PageProps<"/[locale]/home">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <AppHeader />
      <Home />
    </>
  );
}

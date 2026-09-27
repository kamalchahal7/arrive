import { getTranslations, setRequestLocale } from "next-intl/server";
import { Home } from "@/components/home/Home";
import { HomeHeader } from "@/components/home/HomeHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/home">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  return { title: t("checklistTitle") };
}

export default async function HomePage({ params }: PageProps<"/[locale]/home">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <Home />
    </>
  );
}

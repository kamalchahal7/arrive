import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { EndSession } from "@/components/end/EndSession";

export async function generateMetadata({ params }: PageProps<"/[locale]/end">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "End" });
  return { title: t("title") };
}

export default async function Page({ params }: PageProps<"/[locale]/end">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <EndSession />
    </>
  );
}

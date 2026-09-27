import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { IdCardView } from "@/components/id/IdCardView";

export async function generateMetadata({ params }: PageProps<"/[locale]/id">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "IdCard" });
  return { title: t("title") };
}

export default async function IdPage({ params }: PageProps<"/[locale]/id">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <IdCardView />
    </>
  );
}

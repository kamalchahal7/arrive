import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { ProgramsList } from "@/components/programs/ProgramsList";

export async function generateMetadata({ params }: PageProps<"/[locale]/programs">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Programs" });
  return { title: t("title") };
}

export default async function Page({ params }: PageProps<"/[locale]/programs">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <ProgramsList />
    </>
  );
}

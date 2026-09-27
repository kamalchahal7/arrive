import { getTranslations, setRequestLocale } from "next-intl/server";
import { AssistantView } from "@/components/assistant/AssistantView";
import { HomeHeader } from "@/components/home/HomeHeader";

export async function generateMetadata({ params }: PageProps<"/[locale]/assistant">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Assistant" });
  return { title: t("title") };
}

export default async function AssistantPage({ params }: PageProps<"/[locale]/assistant">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <AssistantView />
    </>
  );
}

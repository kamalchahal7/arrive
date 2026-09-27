import { setRequestLocale } from "next-intl/server";
import { LanguageScreen } from "@/components/LanguageScreen";

export default async function LanguagePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LanguageScreen />;
}

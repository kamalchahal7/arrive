import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppShell";
import { Onboarding } from "@/components/onboarding/Onboarding";

export async function generateMetadata({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Onboarding" });
  return { title: t("summary.create") };
}

export default async function OnboardingPage({ params }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <AppHeader />
      <Onboarding />
    </>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { StaffCardView } from "@/components/card/StaffCardView";

export async function generateMetadata({ params }: PageProps<"/[locale]/card">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "StaffCard" });
  // Referrer off: a scanned card never tells another site where it came from.
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" as const };
}

// The staff card renders only from the URL fragment, which browsers never send to a server.
export default async function CardPage({ params }: PageProps<"/[locale]/card">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaffCardView />;
}

import { setRequestLocale } from "next-intl/server";
import { StaffCardView } from "@/components/card/StaffCardView";

// Referrer off and not indexed: a card never tells another site where it came from.
export const metadata = { title: "For staff", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

// "Show my card": renders only from the URL fragment, which browsers never send to a server.
export default async function CardPage({ params }: PageProps<"/[locale]/card">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaffCardView />;
}

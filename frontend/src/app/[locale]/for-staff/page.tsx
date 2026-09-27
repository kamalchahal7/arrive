import { setRequestLocale } from "next-intl/server";
import { StaffIntro } from "@/components/card/StaffIntro";

// Referrer off and not indexed: a scanned card never tells another site where it came from.
export const metadata = { title: "For staff", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

// Opened by a staff member who scans the QR code. English only; the content lives in the URL fragment.
export default async function ForStaffPage({ params }: PageProps<"/[locale]/for-staff">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StaffIntro />;
}

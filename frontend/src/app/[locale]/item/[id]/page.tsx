import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { HomeHeader } from "@/components/home/HomeHeader";
import { ItemDetail } from "@/components/item/ItemDetail";
import { findItem } from "@/data/checklist";
import { findProgram } from "@/data/programs";

// A checklist item or a government-run program (both from src/data).
export default async function ItemPage({ params }: PageProps<"/[locale]/item/[id]">) {
  const { locale, id } = await params;
  if (!findItem(id) && !findProgram(id)) notFound();
  setRequestLocale(locale);
  return (
    <>
      <HomeHeader />
      <ItemDetail itemId={id} />
    </>
  );
}

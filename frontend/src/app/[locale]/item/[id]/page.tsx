import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setRequestLocale } from "next-intl/server";
import { AppHeader } from "@/components/AppShell";
import { ItemDetail } from "@/components/item/ItemDetail";

export default async function ItemPage({ params }: PageProps<"/[locale]/item/[id]">) {
  const { locale, id } = await params;
  if (!/^[a-z0-9_]{2,60}$/.test(id)) notFound();
  setRequestLocale(locale);
  // Read at request time, so the key can be set in frontend/.env on the server without a rebuild.
  // Embed API keys are meant to be public; restrict the key to this site's domain in Google Cloud.
  await connection();
  const googleKey = process.env.GOOGLE_MAPS_EMBED_KEY || null;
  return (
    <>
      <AppHeader />
      <ItemDetail itemId={id} googleKey={googleKey} />
    </>
  );
}

import { redirect } from "@/i18n/navigation";

// Programs are listed on the home screen ("Government-run programs").
export default async function Page({ params }: PageProps<"/[locale]/programs">) {
  const { locale } = await params;
  redirect({ href: "/home", locale });
}

"use client";

// The ID card (docs/REDESIGN.md section 11): name, Arrive ID, languages and household, with a QR code holding only
// the ID (in the URL fragment) so the person can reopen their checklist on another phone.

import { ArrowLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { languageInfo, languageName } from "@/config/languages";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cacheProfile, getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";

export function IdCardView() {
  const t = useTranslations("IdCard");
  const to = useTranslations("Onboarding");
  const locale = useLocale();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const pid = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the ID and cached profile live in localStorage */
    setId(pid);
    setProfile(getCachedProfile<Profile>());
    setOrigin(window.location.origin);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!pid) return;
    api<Profile>(`/profile/${pid}`)
      .then((p) => {
        const merged = { ...p, first_name: p.first_name ?? getCachedProfile<Profile>()?.first_name ?? null };
        cacheProfile(merged);
        setProfile(merged);
      })
      .catch(() => {});
  }, []);

  if (id === null) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-lg">{t("none")}</p>
        <Link href="/onboarding" className="btn btn-primary self-start">
          {t("start")}
        </Link>
      </main>
    );
  }
  if (!id) return <main id="main" className="min-h-dvh" />;

  const readable = profile?.public_id ?? id;
  const size = profile ? profile.adults + profile.seniors + profile.children_0_5 + profile.children_6_17 : null;
  const others = (profile?.other_languages ?? []).filter((l) => l !== locale).map((l) => languageName(l, locale));

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <article className="card flex flex-col gap-4 border-2 border-teal" aria-labelledby="id-name">
        <p id="id-name" className="text-3xl font-bold" dir="auto">
          {profile?.first_name || t("noName")}
        </p>
        <div>
          <p className="eyebrow">{t("id")}</p>
          <p lang="en" dir="ltr" className="font-mono text-2xl font-bold tracking-wider text-teal">
            {readable}
          </p>
        </div>
        <div>
          <p className="eyebrow">{t("languages")}</p>
          <p className="text-lg font-bold">
            <span lang={locale}>{languageInfo(locale).nativeName}</span>
            {others.length > 0 && <span className="font-normal"> · {others.join(", ")}</span>}
          </p>
        </div>
        {size !== null && (
          <div>
            <p className="eyebrow">{t("family")}</p>
            <p className="text-lg font-bold">{to("household.total", { count: size })}</p>
          </div>
        )}
        {origin && (
          <div className="flex flex-col items-center gap-2 border-t border-line pt-4 text-center">
            <QrCode value={`${origin}/${locale}/onboarding#open=${readable}`} label={t("qrLabel")} size={200} />
            <p className="text-sm text-muted">{t("qrHint")}</p>
          </div>
        )}
      </article>
      <p className="text-lg">{t("intro")}</p>
    </main>
  );
}

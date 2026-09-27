"use client";

// My ID card: the Arrive ID and the onboarding answers, as a plain list with English + local labels.

import { ArrowLeft } from "lucide-react";
import { useLocale } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Pair, useBi } from "@/components/Bi";
import { countryName, languageInfo } from "@/config/languages";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cacheProfile, getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";

export function IdCardView() {
  const b = useBi("IdCard");
  const bo = useBi("Onboarding");
  const bc = useBi("Common");
  const locale = useLocale();
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const pid = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the ID and cached profile live in localStorage */
    setId(pid);
    setProfile(getCachedProfile<Profile>());
    /* eslint-enable react-hooks/set-state-in-effect */
    if (!pid) return;
    api<Profile>(`/profile/${pid}`)
      .then((p) => {
        const local = getCachedProfile<Profile>();
        const merged = {
          ...p,
          first_name: p.first_name ?? local?.first_name ?? null,
          city_name: p.city_name ?? local?.city_name ?? null,
          country_text: local?.country_text ?? null,
        };
        cacheProfile(merged);
        setProfile(merged);
      })
      .catch(() => {});
  }, []);

  if (id === null) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-8">
        <h1 className="font-display text-3xl font-semibold">{b("title")}</h1>
        <p className="text-lg">{b("none")}</p>
        <Link href="/onboarding" className="btn btn-primary self-start">
          {b("start")}
        </Link>
      </main>
    );
  }
  if (!id) return <main id="main" className="min-h-dvh" />;

  const p = profile;
  const notGiven = bc("notGiven");
  const yesNo = (v: boolean) => (v ? bc("yes") : bc("no"));
  const kids = (p?.children_0_5 ?? 0) + (p?.children_6_17 ?? 0);
  const disability = Boolean(p?.disability_adult || p?.disability_senior || p?.disability_child);
  const lang = languageInfo(p?.preferred_language || locale);
  const country = p?.country_text || (p?.country_of_origin ? countryName(p.country_of_origin, locale) : null);
  const city = p?.city_name || (p?.city === "ottawa" ? "Ottawa" : null);

  const rows: [string, ReactNode][] = [
    ["firstName.label", p?.first_name || notGiven],
    ["gender.label", p?.gender ? bo(`gender.${p.gender}`) : notGiven],
    ["country.label", country || notGiven],
    ["language", <Pair key="l" en={lang.englishName} local={lang.nativeName} />],
    ["city.label", city || notGiven],
    ["selfAge.label", p ? yesNo(p.self_age_group === "senior") : notGiven],
    [
      "household.label",
      p ? (
        <span className="flex flex-col">
          <span>
            {bo("household.adults")}: {p.adults}
          </span>
          <span>
            {bo("household.seniors")}: {p.seniors}
          </span>
          <span>
            {bo("summary.children", { count: kids })}
          </span>
        </span>
      ) : (
        notGiven
      ),
    ],
    ["disability.label", p ? yesNo(disability) : notGiven],
  ];

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {b("back")}
      </Link>
      <h1 className="font-display text-3xl font-semibold">{b("title")}</h1>
      <article className="card flex flex-col gap-4 border-2 border-brand" aria-labelledby="id-label">
        <div>
          <p id="id-label" className="eyebrow">
            {b("id")}
          </p>
          <p lang="en" dir="ltr" className="font-mono text-2xl font-bold tracking-wider text-brand">
            {p?.public_id ?? id}
          </p>
        </div>
        <dl className="flex flex-col divide-y divide-line border-t border-line">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 py-2.5">
              <dt className="text-sm font-bold text-muted">{label === "language" ? b("language") : bo(label)}</dt>
              <dd className="text-lg font-bold" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </article>
    </main>
  );
}

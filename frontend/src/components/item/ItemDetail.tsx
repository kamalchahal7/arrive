"use client";

// A checklist item or program (docs/REDESIGN.md 7.1, 7.3), in the order the spec gives: title and status, photo,
// map, address and phone, documents, steps, staff card, source.

import {
  ArrowLeft, Building2, Check, Heart, CheckCircle2, Circle, Clock, Copy, ExternalLink, FileText, IdCard, Info, MapPin, Phone,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { CARD_RETURN_KEY } from "@/components/card/StaffCardView";
import { ListenButton } from "@/components/ListenButton";
import { ErrorNote } from "@/components/Notices";
import { intlLocale } from "@/config/languages";
import { Link, useRouter } from "@/i18n/navigation";
import { api, errorCode } from "@/lib/api";
import { CARD_LIFETIME_DAYS, encodeCard } from "@/lib/cardPayload";
import { track } from "@/lib/events";
import { cacheChecklist, cachedChecklist, saveChange, withStatus } from "@/lib/progress";
import { getCachedProfile, getProfileId } from "@/lib/storage";
import type { ItemDetail as Detail, Place, Profile } from "@/lib/types";
import { PlaceMap } from "./PlaceMap";

const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const DETAIL_CACHE = "arrive.itemCache";

function localDate(value: string, locale: string): string {
  // Date-only strings are local dates (new Date("2026-09-26") would be UTC midnight, a day early in Ottawa).
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(new Date(y, m - 1, d));
}

function readCache(key: string): Detail | null {
  try {
    return (JSON.parse(localStorage.getItem(DETAIL_CACHE) || "{}") as Record<string, Detail>)[key] ?? null;
  } catch {
    return null;
  }
}

function writeCache(key: string, detail: Detail): void {
  try {
    const all = JSON.parse(localStorage.getItem(DETAIL_CACHE) || "{}") as Record<string, Detail>;
    const keys = Object.keys(all).filter((k) => k !== key).slice(-29); // keep the last 30 pages viewed
    const next: Record<string, Detail> = Object.fromEntries(keys.map((k) => [k, all[k]]));
    next[key] = detail;
    localStorage.setItem(DETAIL_CACHE, JSON.stringify(next));
  } catch {
    /* storage unavailable or full */
  }
}

function PhotoOrPlaceholder({ place }: { place: Place }) {
  const t = useTranslations("Item");
  // Photos come only from files the team adds to public/locations/ (their own, or with rights). Never hotlinked.
  if (place.photo) {
    // eslint-disable-next-line @next/next/no-img-element -- a small local file; no image optimizer on this route
    return <img src={`/locations/${place.photo}`} alt={t("photoAlt", { place: place.name })} className="aspect-[4/3] w-full rounded-card object-cover" />;
  }
  return (
    <figure className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-teal-light text-teal">
      <Building2 aria-hidden className="size-16" strokeWidth={1.5} />
      <figcaption className="px-4 text-center text-sm font-bold">{t("photoPlaceholder")}</figcaption>
    </figure>
  );
}

export function ItemDetail({ itemId, googleKey }: { itemId: string; googleKey: string | null }) {
  const t = useTranslations("Item");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const router = useRouter();
  const [profileId, setProfileIdState] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [haveDocs, setHaveDocs] = useState<number[]>([]);
  const [cardError, setCardError] = useState<string | null>(null);
  const [interested, setInterested] = useState(false);
  const cacheKey = `${locale}|${itemId}`;
  const docsKey = `arrive.docs.${itemId}`;

  const load = useCallback(async (pid: string | null) => {
    setError(null);
    try {
      const d = await api<Detail>(`/items/${itemId}?lang=${locale}${pid ? `&profile_id=${encodeURIComponent(pid)}` : ""}`);
      setDetail(d);
      setOffline(false);
      writeCache(cacheKey, d);
      track(d.kind === "program" ? "view_program" : "view_item", locale, d.id);
    } catch (err) {
      const cached = readCache(cacheKey);
      if (cached) {
        setDetail(cached);
        setOffline(true);
      } else {
        setError(errorCode(err));
      }
    }
  }, [cacheKey, itemId, locale]);

  useEffect(() => {
    const pid = getProfileId();
    /* eslint-disable react-hooks/set-state-in-effect -- the profile ID and ticked documents live in localStorage */
    setProfileIdState(pid);
    try {
      setHaveDocs(JSON.parse(localStorage.getItem(docsKey) || "[]") as number[]);
      setInterested(localStorage.getItem(`arrive.interest.${itemId}`) === "1");
    } catch {
      setHaveDocs([]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    void load(pid);
  }, [docsKey, itemId, load]);

  const toggleRow = async (personKey: string, done: boolean) => {
    if (!detail || !profileId) return;
    const status = done ? "todo" : "done";
    const change = { item_id: detail.id, person_key: personKey, status } as const;
    setDetail({ ...detail, rows: detail.rows.map((r) => (r.person_key === personKey ? { ...r, status } : r)) });
    const cached = cachedChecklist(locale);
    if (cached) cacheChecklist(locale, withStatus(cached, change));
    if (status === "done") track("item_done", locale, detail.id);
    await saveChange(profileId, change);
  };

  const markInterest = () => {
    if (!detail) return;
    setInterested(true);
    track("program_interest", locale, detail.id);
    try {
      localStorage.setItem(`arrive.interest.${detail.id}`, "1");
    } catch {
      /* storage unavailable */
    }
  };

  const toggleDoc = (i: number) => {
    const next = haveDocs.includes(i) ? haveDocs.filter((x) => x !== i) : [...haveDocs, i];
    setHaveDocs(next);
    try {
      localStorage.setItem(docsKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const openStaffCard = async () => {
    if (!detail || !profileId) return;
    setCardError(null);
    try {
      // English documents for the clerk; the rest comes from this phone. Nothing is sent to the server.
      const english = locale === "en" ? detail : await api<Detail>(`/items/${itemId}?lang=en`);
      const profile = getCachedProfile<Profile>();
      const now = Math.floor(Date.now() / 1000);
      const payload = await encodeCard({
        v: 1,
        n: profile?.first_name ?? null,
        l: locale,
        o: profile?.other_languages ?? [],
        i: detail.id,
        t: detail.title,
        de: english.documents,
        dx: [],
        id: profile?.public_id ?? profileId,
        c: now,
        e: now + CARD_LIFETIME_DAYS * 86400,
        k: Math.max(1, detail.rows.length),
      });
      try {
        sessionStorage.setItem(CARD_RETURN_KEY, window.location.pathname);
      } catch {
        /* the card still works; it just has no Back link */
      }
      track("staff_card_opened", locale, detail.id);
      router.push(`/card#${payload}`);
    } catch (err) {
      setCardError(errorCode(err));
    }
  };

  if (error) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
        <Link href="/home" className="btn btn-quiet self-start !px-0">
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("back")}
        </Link>
        <ErrorNote code={error} onRetry={() => void load(profileId)} />
      </main>
    );
  }
  if (!detail) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6" aria-busy="true">
        <p role="status" className="text-muted">
          {tc("loading")}
        </p>
      </main>
    );
  }

  const place = detail.location;
  const spoken = [detail.title, detail.summary, ...detail.steps].join(". ");
  const phones = place?.phone ? [...place.phone.matchAll(PHONE)].map((m) => m[0]) : [];
  const allDone = detail.rows.length > 0 && detail.rows.every((r) => r.status === "done");

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-4 pb-12">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      {offline && (
        <p role="status" className="card bg-amber-light text-amber-ink">
          {t("offline")}
        </p>
      )}

      {/* 1. Title, who it is for, phase, essential badge, mark as done, listen */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {detail.phase_label && <span className="eyebrow">{detail.phase_label}</span>}
          {detail.essential && (
            <span className="rounded-full bg-amber-light px-2.5 py-0.5 text-sm font-bold text-amber-ink">{t("essential")}</span>
          )}
        </div>
        <h1 className="font-display text-3xl leading-tight font-semibold">{detail.title}</h1>
        <p className="text-lg">{detail.summary}</p>
        <ListenButton text={spoken} language={locale} />
      </header>

      {detail.kind === "checklist" && detail.rows.length > 0 && (
        <section aria-labelledby="who" className="card flex flex-col gap-2">
          <h2 id="who" className="text-lg font-bold">
            {allDone ? t("allDone") : t("forWho")}
          </h2>
          <ul className="flex flex-col gap-2">
            {detail.rows.map((r) => {
              const done = r.status === "done";
              return (
                <li key={r.person_key}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() => void toggleRow(r.person_key, done)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-card border-2 px-4 py-2 text-start text-lg font-bold ${
                      done ? "border-teal bg-teal-light text-teal" : "border-line bg-surface hover:border-teal"
                    }`}
                  >
                    {done ? <CheckCircle2 aria-hidden className="size-7 shrink-0" /> : <Circle aria-hidden className="size-7 shrink-0 text-muted" />}
                    <span className="flex-1">{r.person_label}</span>
                    <span className="text-base font-normal">{done ? t("done") : t("markDone")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {detail.notes.map((note, i) => (
        <p key={i} className="card flex items-start gap-2 bg-teal-light">
          <Info aria-hidden className="mt-1 size-5 shrink-0 text-teal" />
          <span>{note}</span>
        </p>
      ))}

      {/* 2-4. Photo, map, address, phone, hours */}
      {place && (
        <section aria-labelledby="where" className="flex flex-col gap-3">
          <h2 id="where" className="text-xl font-bold">
            {t("where")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {detail.in_person && <PhotoOrPlaceholder place={place} />}
            <PlaceMap place={place} googleKey={googleKey} />
          </div>
          <div className="card flex flex-col gap-3">
            <div>
                            <div className="text-lg font-bold" lang="en" dir="ltr">
                {place.name}
              </div>
              {place.institution && (
                <div className="text-muted" lang="en" dir="ltr">
                  {place.institution}
                </div>
              )}
            </div>
            <div className="flex items-start gap-2">
              <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-teal" />
              <div className="flex-1">
                <h3 className="font-bold">{t("address")}</h3>
                <div lang="en" dir="ltr" className="text-start">
                  {place.address ?? <span className="text-muted">{t("notYet")}</span>}
                </div>
                {place.address && (
                  <button
                    type="button"
                    className="btn btn-quiet mt-1 !px-0"
                    onClick={() =>
                      void navigator.clipboard?.writeText(place.address ?? "").then(
                        () => setCopied(true),
                        () => setCopied(false),
                      )
                    }
                  >
                    <Copy aria-hidden className="size-5" />
                    {t("copy")}
                  </button>
                )}
                <span role="status" className="block text-sm text-teal">
                  {copied ? t("copied") : ""}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone aria-hidden className="mt-1 size-5 shrink-0 text-teal" />
              <div>
                <h3 className="font-bold">{t("phone")}</h3>
                <div lang="en" dir="ltr">
                  {phones.length ? (
                    <span className="flex flex-col gap-1">
                      <span>{place.phone}</span>
                      <span className="flex flex-wrap gap-2">
                        {phones.map((p) => (
                          <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="btn btn-secondary !min-h-11">
                            <Phone aria-hidden className="size-5" />
                            {t("call", { phone: `⁦${p}⁩` })}
                          </a>
                        ))}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">{t("notYet")}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock aria-hidden className="mt-1 size-5 shrink-0 text-teal" />
              <div>
                <h3 className="font-bold">{t("hours")}</h3>
                <div lang="en" dir="ltr">
                  {place.hours ?? <span className="text-muted">{t("notYet")}</span>}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Programs: who can get it, how to apply */}
      {detail.kind === "program" && detail.eligibility.length > 0 && (
        <section aria-labelledby="eligibility" className="flex flex-col gap-2">
          <h2 id="eligibility" className="text-xl font-bold">
            {t("eligibility")}
          </h2>
          <ul className="card flex flex-col gap-2">
            {detail.eligibility.map((e, i) => (
              <li key={i} className="flex gap-2">
                <Check aria-hidden className="mt-1 size-5 shrink-0 text-teal" />
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.kind === "program" && (
        <button
          type="button"
          className={`btn min-h-14 text-lg ${interested ? "btn-secondary" : "btn-primary"}`}
          aria-pressed={interested}
          onClick={markInterest}
          disabled={interested}
        >
          <Heart aria-hidden className="size-6" fill={interested ? "currentColor" : "none"} />
          {interested ? t("interestedDone") : t("interested")}
        </button>
      )}

      {/* 5. Documents to bring */}
      {detail.kind === "checklist" && (
        <section aria-labelledby="documents" className="flex flex-col gap-2">
          <h2 id="documents" className="text-xl font-bold">
            {t("documents")}
          </h2>
          {detail.documents.length ? (
            <>
              <p className="text-muted">{t("documentsHint")}</p>
              <ul className="flex flex-col gap-2">
                {detail.documents.map((doc, i) => {
                  const have = haveDocs.includes(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={have}
                        onClick={() => toggleDoc(i)}
                        className={`flex w-full items-start gap-3 rounded-card border-2 p-3 text-start ${
                          have ? "border-teal bg-teal-light" : "border-line bg-surface"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${
                            have ? "border-teal bg-teal text-white" : "border-muted"
                          }`}
                        >
                          {have ? <Check className="size-5" /> : <FileText className="size-5 text-muted" />}
                        </span>
                        <span className="text-lg">{doc}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="card">{t("noDocuments")}</p>
          )}
        </section>
      )}

      {/* 6. Steps (programs: how to apply) */}
      {(detail.kind === "checklist" ? detail.steps : detail.how_to_apply).length > 0 && (
        <section aria-labelledby="steps" className="flex flex-col gap-2">
          <h2 id="steps" className="text-xl font-bold">
            {detail.kind === "checklist" ? t("steps") : t("howToApply")}
          </h2>
          <ol className="flex flex-col gap-3">
            {(detail.kind === "checklist" ? detail.steps : detail.how_to_apply).map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-bold text-white"
                >
                  {i + 1}
                </span>
                <span className="pt-1 text-lg">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 7. Staff card for in-person essential steps */}
      {detail.staff_card && profileId && (
        <section aria-labelledby="staff" className="card flex flex-col gap-3 border-2 border-teal">
          <h2 id="staff" className="flex items-center gap-2 text-xl font-bold">
            <IdCard aria-hidden className="size-6 text-teal" />
            {t("staffCard")}
          </h2>
          <p>{t("staffCardHint")}</p>
          <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={() => void openStaffCard()}>
            {t("staffCardOpen")}
          </button>
          {cardError && <ErrorNote code={cardError} />}
        </section>
      )}

      {/* 8. Source, last checked, information not advice */}
      <footer className="flex flex-col gap-2 border-t border-line pt-4">
        {!detail.reviewed && (
          <p className="flex items-start gap-2 text-amber-ink">
            <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0" />
            <span>{t("draft")}</span>
          </p>
        )}
        {detail.source && (
          <p className="flex flex-col gap-0.5">
            <span className="eyebrow">{tc("source")}</span>
            <a href={detail.source.url} target="_blank" rel="noopener noreferrer" className="btn-quiet inline-flex items-center gap-1 self-start font-bold" lang="en">
              {detail.source.title || detail.source.url}
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">{tc("opensNewTab")}</span>
            </a>
            {detail.source.last_checked && (
              <span className="text-sm text-muted">{tc("lastChecked", { date: localDate(detail.source.last_checked, locale) })}</span>
            )}
          </p>
        )}
        <p className="text-sm text-muted">{detail.disclaimer}</p>
      </footer>
    </main>
  );
}

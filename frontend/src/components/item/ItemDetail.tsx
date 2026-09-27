"use client";

// A checklist item or a government-run program, from the hardcoded Ottawa data (src/data).
// Checklist item, top to bottom: title and short description, location card(s) with "Open Google Maps" under each,
// documents to bring, steps (the same three first steps everywhere, with the ID button in step 2), official source.
// Program: description, who can get it, how to apply, location card(s), "I'm interested" (logged once), source.

import { ArrowLeft, Check, Clock, ExternalLink, FileText, Heart, IdCard, MapPin, Navigation, Phone } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Pair, useBi } from "@/components/Bi";
import { CARD_RETURN_KEY } from "@/components/card/StaffCardView";
import { ListenButton } from "@/components/ListenButton";
import { countryName } from "@/config/languages";
import { DOCUMENTS, type ChecklistItem, findItem } from "@/data/checklist";
import { findProgram, type Program } from "@/data/programs";
import { mapsUrl, type Place, type Source, tr } from "@/data/types";
import { Link, useRouter } from "@/i18n/navigation";
import { encodeCard } from "@/lib/cardPayload";
import { track } from "@/lib/events";
import { getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";

// Phone numbers inside text like "3-1-1 or 613-580-2400" or "613-237-1320 ext 260".
const PHONE = /\b\d-\d-\d\b|\+?\d[\d\s().-]{6,}\d/g;

function PlaceCard({ place }: { place: Place }) {
  const b = useBi("Item");
  const phones = place.phone ? [...place.phone.matchAll(PHONE)].map((m) => m[0]) : [];
  // Keep notes such as "ext 260" or "(central intake)" visible next to the call buttons.
  const phoneNote = place.phone ? place.phone.replace(PHONE, "").replace(/\bor\b/g, "").replace(/[\s,/]+/g, " ").trim() : "";
  return (
    <div className="flex flex-col gap-2">
      <div className="card flex flex-col gap-3">
        <p className="text-lg font-bold" lang="en" dir="ltr">
          {place.name}
        </p>
        {place.address && (
          <div className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h3 className="text-sm font-bold text-muted">{b("address")}</h3>
              <p lang="en" dir="ltr" className="text-start">
                {place.address}
              </p>
            </div>
          </div>
        )}
        {place.phone && (
          <div className="flex items-start gap-2">
            <Phone aria-hidden className="mt-1 size-5 shrink-0 text-brand" />
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold text-muted">{b("phone")}</h3>
              {phones.length ? (
                <span className="flex flex-wrap gap-2" lang="en" dir="ltr">
                  {phones.map((p) => (
                    <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="btn btn-secondary !min-h-11" aria-label={`${b.text("call")} ${p}`}>
                      <Phone aria-hidden className="size-5" />
                      {p}
                    </a>
                  ))}
                </span>
              ) : (
                <p lang="en" dir="ltr">
                  {place.phone}
                </p>
              )}
              {phones.length > 0 && phoneNote && (
                <p className="text-sm text-muted" lang="en" dir="ltr">
                  {place.phone}
                </p>
              )}
            </div>
          </div>
        )}
        {place.hours && (
          <div className="flex items-start gap-2">
            <Clock aria-hidden className="mt-1 size-5 shrink-0 text-brand" />
            <div>
              <h3 className="text-sm font-bold text-muted">{b("hours")}</h3>
              <p lang="en" dir="ltr">
                {place.hours}
              </p>
            </div>
          </div>
        )}
      </div>
      {place.map && (
        <a href={mapsUrl(place)} target="_blank" rel="noopener noreferrer" className="btn btn-primary min-h-14 text-lg">
          <Navigation aria-hidden className="size-5" />
          {b("openMaps")}
        </a>
      )}
    </div>
  );
}

function SourceLink({ source }: { source: Source }) {
  const bc = useBi("Common");
  return (
    <footer className="flex flex-col gap-1 border-t border-line pt-4">
      <span className="eyebrow">{bc("source")}</span>
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="btn-quiet inline-flex items-center gap-1 self-start font-bold" lang="en">
        {source.title}
        <ExternalLink aria-hidden className="size-4" />
        <span className="sr-only">{bc.local("opensNewTab")}</span>
      </a>
    </footer>
  );
}

function BackLink() {
  const b = useBi("Item");
  return (
    <Link href="/home" className="btn btn-quiet self-start !px-0">
      <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
      {b("back")}
    </Link>
  );
}

export function ItemDetail({ itemId }: { itemId: string }) {
  const item = findItem(itemId);
  const program = item ? undefined : findProgram(itemId);
  if (item) return <ChecklistDetail item={item} />;
  if (program) return <ProgramDetail program={program} />;
  return null;
}

function ChecklistDetail({ item }: { item: ChecklistItem }) {
  const b = useBi("Item");
  const bo = useBi("Onboarding");
  const locale = useLocale();
  const router = useRouter();
  const [haveDocs, setHaveDocs] = useState<string[]>([]);
  const docsKey = `arrive.docs.${item.id}`;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- ticked documents live in localStorage */
    try {
      setHaveDocs(JSON.parse(localStorage.getItem(docsKey) || "[]") as string[]);
    } catch {
      setHaveDocs([]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    track("view_item", locale, item.id);
  }, [docsKey, item.id, locale]);

  const toggleDoc = (doc: string) => {
    const next = haveDocs.includes(doc) ? haveDocs.filter((x) => x !== doc) : [...haveDocs, doc];
    setHaveDocs(next);
    try {
      localStorage.setItem(docsKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const showCard = async () => {
    const pid = getProfileId();
    if (!pid) return router.push("/onboarding");
    const profile = getCachedProfile<Profile>();
    const ticked = item.documents.filter((d) => haveDocs.includes(d));
    const payload = await encodeCard({
      v: 2,
      n: profile?.first_name ?? null,
      l: locale,
      g: profile?.gender ? bo.en(`gender.${profile.gender}`) : null,
      c: profile?.country_of_origin ? countryName(profile.country_of_origin, "en") : (profile?.country_text ?? null),
      i: item.id,
      a: item.action,
      d: (ticked.length ? ticked : item.documents).map((d) => DOCUMENTS[d].en),
      id: profile?.public_id ?? pid,
    });
    try {
      sessionStorage.setItem(CARD_RETURN_KEY, window.location.pathname);
    } catch {
      /* the card still works; it just has no Back link */
    }
    track("staff_card_opened", locale, item.id);
    router.push(`/card#${payload}`);
  };

  const steps = item.steps.map((s) => tr(s, locale));
  const spoken = [tr(item.title, locale), tr(item.summary, locale), b.local("step1"), b.local("step2"), b.local("step3"), ...steps].join(". ");

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-4 pb-12">
      <BackLink />

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-semibold">
          <Pair en={item.title.en} local={tr(item.title, locale)} />
        </h1>
        <p className="text-lg">{tr(item.summary, locale)}</p>
        <ListenButton text={spoken} language={locale} />
      </header>

      <section aria-label={b.text("where")} className="flex flex-col gap-4">
        {item.places.map((place, i) => (
          <PlaceCard key={i} place={place} />
        ))}
      </section>

      <section aria-labelledby="documents" className="flex flex-col gap-2">
        <h2 id="documents" className="text-xl font-bold">
          {b("documents")}
        </h2>
        <p className="text-muted">{b.local("documentsHint")}</p>
        <ul className="flex flex-col gap-2">
          {item.documents.map((doc) => {
            const have = haveDocs.includes(doc);
            return (
              <li key={doc}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={have}
                  onClick={() => toggleDoc(doc)}
                  className={`flex w-full items-start gap-3 rounded-card border-2 p-3 text-start ${have ? "border-brand bg-brand-light" : "border-line bg-surface"}`}
                >
                  <span
                    aria-hidden
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 ${have ? "border-brand bg-brand text-white" : "border-muted"}`}
                  >
                    {have ? <Check className="size-5" /> : <FileText className="size-5 text-muted" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-lg">{tr(DOCUMENTS[doc], locale)}</span>
                    {locale !== "en" && (
                      <span className="text-sm text-muted" lang="en" dir="ltr">
                        {DOCUMENTS[doc].en}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-2">
        <h2 id="steps" className="text-xl font-bold">
          {b("steps")}
        </h2>
        <ol className="flex flex-col gap-3">
          {[b("step1"), b("step2"), b("step3"), ...steps].map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
                {i + 1}
              </span>
              <span className="flex-1 text-lg">{step}</span>
              {i === 1 && (
                <button type="button" onClick={() => void showCard()} className="btn btn-primary shrink-0 !min-h-12">
                  <IdCard aria-hidden className="size-6" />
                  {b.local("idButton")}
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      <SourceLink source={item.source} />
    </main>
  );
}

function ProgramDetail({ program }: { program: Program }) {
  const b = useBi("Item");
  const bp = useBi("Programs");
  const ba = useBi("Apply");
  const locale = useLocale();
  const [interested, setInterested] = useState(false);
  const key = `arrive.interest.${program.id}`;

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the one-time interest lives in localStorage
      setInterested(localStorage.getItem(key) === "1");
    } catch {
      /* storage unavailable */
    }
    track("view_program", locale, program.id);
  }, [key, locale, program.id]);

  const markInterest = () => {
    if (interested) return;
    setInterested(true);
    track("program_interest", locale, program.id);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable */
    }
  };

  const spoken = [tr(program.title, locale), tr(program.description, locale), ba.local(program.apply)].join(". ");

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-4 pb-12">
      <BackLink />

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-semibold">
          <Pair en={program.title.en} local={tr(program.title, locale)} />
        </h1>
        <p className="text-lg">{tr(program.description, locale)}</p>
        <ListenButton text={spoken} language={locale} />
      </header>

      <section aria-labelledby="eligibility" className="flex flex-col gap-2">
        <h2 id="eligibility" className="text-xl font-bold">
          {b("eligibility")}
        </h2>
        <p className="card flex gap-2 text-lg">
          <Check aria-hidden className="mt-1 size-5 shrink-0 text-brand" />
          {bp.local(`who.${program.who}`)}
        </p>
      </section>

      <section aria-labelledby="apply" className="flex flex-col gap-2">
        <h2 id="apply" className="text-xl font-bold">
          {b("howToApply")}
        </h2>
        <p className="text-lg">{ba.local(program.apply)}</p>
      </section>

      <section aria-labelledby="where" className="flex flex-col gap-4">
        <h2 id="where" className="text-xl font-bold">
          {b("where")}
        </h2>
        {program.places.map((place, i) => (
          <PlaceCard key={i} place={place} />
        ))}
      </section>

      <button
        type="button"
        className={`btn min-h-14 text-lg ${interested ? "btn-secondary" : "btn-primary"}`}
        aria-pressed={interested}
        onClick={markInterest}
        disabled={interested}
      >
        <Heart aria-hidden className="size-6" fill={interested ? "currentColor" : "none"} />
        {interested ? b("interestedDone") : b("interested")}
      </button>

      {program.source && <SourceLink source={program.source} />}
    </main>
  );
}

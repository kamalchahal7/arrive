"use client";

// The staff card (docs/REDESIGN.md 7.2), rendered ONLY from the URL fragment. The same page opens on the person's
// phone and on the clerk's phone after scanning the QR code. It makes no request to the Arrive API.

import { ArrowLeft, Check, Expand, Minimize2, Type, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { intlLocale, languageInfo, languageName } from "@/config/languages";
import { staffText } from "@/config/staffCard";
import { type CardData, decodeCard } from "@/lib/cardPayload";

export const CARD_RETURN_KEY = "arrive.cardReturn";

type Loaded = { status: "loading" } | { status: "invalid" } | { status: "ok"; card: CardData; url: string; expired: boolean };

export function StaffCardView() {
  const t = useTranslations("StaffCard");
  const locale = useLocale();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [big, setBig] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const read = async () => {
      const card = await decodeCard(window.location.hash);
      if (!active) return;
      const expired = Boolean(card && card.e > 0 && Date.now() / 1000 > card.e);
      setLoaded(card ? { status: "ok", card, url: window.location.href, expired } : { status: "invalid" });
    };
    void read();
    try {
      // Only set when the person opened the card from their own checklist (not on the clerk's phone).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is only readable after hydration
      setReturnTo(window.sessionStorage.getItem(CARD_RETURN_KEY));
    } catch {
      /* storage unavailable */
    }
    window.addEventListener("hashchange", read);
    return () => {
      active = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  const enterStaffMode = async () => {
    setStaffMode(true);
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
    } catch {
      /* the CSS rotation below takes over when the browser can't lock the screen */
    }
  };
  const exitStaffMode = () => {
    setStaffMode(false);
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
  };

  if (loaded.status === "loading") return <main id="main" className="min-h-dvh" />;
  if (loaded.status === "invalid") {
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-5 text-center">
        <p className="text-xl font-bold" lang="en" dir="ltr">
          This card could not be read. Ask the person to show it again.
        </p>
        <p className="text-xl font-bold" lang="fr" dir="ltr">
          Cette carte ne peut pas être lue. Demandez à la personne de la montrer de nouveau.
        </p>
        <p className="text-lg">{t("invalid")}</p>
      </main>
    );
  }

  const { card, url, expired } = loaded;
  const parts = { name: card.n, itemId: card.i, fallbackTask: card.t, count: card.k, language: card.l, others: card.o };
  const en = staffText("en", parts);
  const fr = staffText("fr", parts);
  const native = languageInfo(card.l);
  const showNative = card.l !== "en" && card.l !== "fr";
  const others = card.o.filter((o) => o !== card.l).map((o) => languageName(o, locale));
  const created = new Date(card.c * 1000);
  const dateText = card.c ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long" }).format(created) : "";
  const size = big ? "text-3xl" : "text-2xl";

  const staffSide = (side: typeof en, lang: "en" | "fr") => (
    <section lang={lang} dir="ltr" className="flex flex-col gap-2" aria-label={side.label}>
      <p className="eyebrow">{side.label}</p>
      <p className={`${size} leading-snug font-bold`}>{side.hello}</p>
      <p className={`${big ? "text-2xl" : "text-xl"} leading-snug`}>{side.arrived}</p>
      <p className={`${size} leading-snug font-bold text-teal`}>{side.task}</p>
      <p className={`${big ? "text-2xl" : "text-xl"} leading-snug`}>{side.speak}</p>
      <p className={`${big ? "text-2xl" : "text-xl"} leading-snug font-bold`}>{side.interpreter}</p>
    </section>
  );

  if (staffMode) {
    // Landscape view for the counter: big English and French, rotated when the phone is held upright.
    return (
      <div className="staff-landscape fixed inset-0 z-50 overflow-auto bg-white p-6 text-black">
        <button
          type="button"
          onClick={exitStaffMode}
          className="btn btn-secondary absolute end-4 top-4"
          aria-label={t("exitStaff")}
        >
          <X aria-hidden className="size-6" />
        </button>
        <div className="grid gap-6 md:grid-cols-2" lang="en" dir="ltr">
          {[en, fr].map((side, i) => (
            <div key={i} lang={i ? "fr" : "en"} className="flex flex-col gap-2 text-2xl leading-snug">
              <p className="font-bold">{side.hello}</p>
              <p>{side.arrived}</p>
              <p className="font-bold text-teal">{side.task}</p>
              <p>{side.speak}</p>
              <p className="font-bold">{side.interpreter}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-xl" lang="en" dir="ltr">
          {en.id} {card.id}
        </p>
      </div>
    );
  }

  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {returnTo ? (
          <a href={returnTo} className="btn btn-quiet !px-0">
            <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
            {t("backToItem")}
          </a>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" aria-pressed={big} onClick={() => setBig(!big)}>
            <Type aria-hidden className="size-5" />
            {returnTo ? t("larger") : <span lang="en" dir="ltr">Larger text / Texte plus grand</span>}
          </button>
          {returnTo && (
            <button type="button" className="btn btn-primary" onClick={() => void enterStaffMode()}>
              <Expand aria-hidden className="size-5" />
              {t("showStaff")}
            </button>
          )}
        </div>
      </div>

      <article className="card flex flex-col gap-5 border-2 border-teal" aria-labelledby="card-title">
        <h1 id="card-title" className="sr-only">
          {t("title")}
        </h1>
        {staffSide(en, "en")}
        <hr className="border-line" />
        {staffSide(fr, "fr")}

        {card.de.length > 0 && (
          <section lang="en" dir="ltr" className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">
              {en.documents} <span lang="fr">/ {fr.documents}</span>
            </h2>
            <ul className="flex flex-col gap-1.5">
              {card.de.map((d, i) => (
                <li key={i} className={`flex gap-2 ${big ? "text-xl" : "text-lg"}`}>
                  <Check aria-hidden className="mt-1.5 size-5 shrink-0 text-teal" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {showNative && (
          <section lang={card.l} dir={native.dir} className="flex flex-col gap-2 rounded-card bg-teal-light p-4">
            <p className="eyebrow">{t("forYou")}</p>
            <p className={`${big ? "text-2xl" : "text-xl"} font-bold`}>
              {card.n ? t("hello", { name: card.n }) : t("helloNoName")}
            </p>
            <p className="text-lg">{t("arrived")}</p>
            <p className="text-lg font-bold">{t("task", { task: card.t })}</p>
            <p className="text-lg">
              {others.length
                ? t("speakAlso", { language: native.nativeName, others: others.join(", ") })
                : t("speak", { language: native.nativeName })}
            </p>
            <p className="text-lg">{t("interpreter", { language: native.nativeName })}</p>
          </section>
        )}

        <p className="flex flex-wrap items-baseline gap-x-2 text-lg" lang="en" dir="ltr">
          <span>{en.id}</span>
          <span className="font-mono text-2xl font-bold tracking-wider">{card.id}</span>
        </p>
      </article>

      <section className="card flex flex-col items-center gap-3 text-center" aria-labelledby="qr-title">
        <h2 id="qr-title" className="text-lg font-bold">
          {t("scanTitle")}
        </h2>
        <QrCode value={url} label={t("scanTitle")} size={300} />
        <p className="text-muted">{t("scan")}</p>
      </section>

      <p className="flex items-start gap-2 text-muted">
        <Minimize2 aria-hidden className="mt-1 size-5 shrink-0" />
        <span>
          {t("onlyThis")} {dateText && t("created", { date: dateText })}
        </span>
      </p>
      <p className="text-sm text-muted" lang="en" dir="ltr">
        This card contains only what you see here.
        {card.c ? ` Created on ${new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(created)}.` : ""}
      </p>
      {expired && (
        <p role="status" className="card bg-amber-light font-bold text-amber-ink">
          {t("expired")}
        </p>
      )}
    </main>
  );
}

"use client";

// "Show my card" (opened from step 2 of a checklist item): a large QR code for the staff member, and one line in the
// person's language. The QR code opens the English page /en/for-staff with the same fragment on the staff member's
// own phone. Everything comes from the URL fragment; nothing is sent to the Arrive API.

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { decodeCard } from "@/lib/cardPayload";

export const CARD_RETURN_KEY = "arrive.cardReturn";

type Loaded = { status: "loading" } | { status: "invalid" } | { status: "ok"; url: string };

export function StaffCardView() {
  const t = useTranslations("StaffCard");
  const tc = useTranslations("Common");
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const read = async () => {
      const card = await decodeCard(window.location.hash);
      if (!active) return;
      setLoaded(card ? { status: "ok", url: `${window.location.origin}/en/for-staff${window.location.hash}` } : { status: "invalid" });
    };
    void read();
    try {
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

  if (loaded.status === "loading") return <main id="main" className="min-h-dvh" />;
  if (loaded.status === "invalid") {
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-5 text-center">
        <p className="text-xl font-bold">{t("invalid")}</p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col items-center gap-4 px-4 py-4">
      {returnTo ? (
        <a href={returnTo} className="btn btn-quiet self-start !px-0">
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {tc("back")}
        </a>
      ) : (
        <span />
      )}
      <h1 className="eyebrow text-base" lang="en" dir="ltr">
        For staff
      </h1>
      <div className="w-full rounded-card border-2 border-line bg-white p-3 [&>svg]:h-auto [&>svg]:w-full">
        <QrCode value={loaded.url} label="QR code for staff" size={640} />
      </div>
      <p className="text-center text-xl font-bold">{t("sharing")}</p>
    </main>
  );
}

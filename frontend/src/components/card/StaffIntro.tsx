"use client";

// The English page a staff member opens by scanning the QR code on the person's phone. Built only from the URL
// fragment (never sent to a server): who the person is, their language, and what they are here to do.

import { useEffect, useState } from "react";
import { languageInfo } from "@/config/languages";
import { type CardData, decodeCard } from "@/lib/cardPayload";

export function StaffIntro() {
  const [card, setCard] = useState<CardData | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const read = async () => {
      const c = await decodeCard(window.location.hash);
      if (active) setCard(c);
    };
    void read();
    window.addEventListener("hashchange", read);
    return () => {
      active = false;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  if (card === undefined) return <main id="main" className="min-h-dvh" />;
  if (card === null) {
    return (
      <main id="main" lang="en" dir="ltr" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5 text-center">
        <p className="text-xl font-bold">This card could not be read. Please ask the person to show the QR code again.</p>
      </main>
    );
  }

  const language = languageInfo(card.l).englishName;
  return (
    <main id="main" lang="en" dir="ltr" className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-8">
      <p className="eyebrow">Arrive · For staff</p>
      <article className="card flex flex-col gap-4 border-2 border-brand text-xl leading-relaxed">
        <p>
          Hello{card.n ? (
            <>
              , my name is <strong>{card.n}</strong>
            </>
          ) : null}
          . I recently arrived in Canada as a government-assisted refugee. I do not speak English or French. I speak{" "}
          <strong>{language}</strong>. I am here to <strong>{card.a}</strong>. Can you please guide me to someone who can
          help?
        </p>
      </article>
      <dl className="card grid gap-3 text-lg">
        <div>
          <dt className="text-sm font-bold text-muted">Gender</dt>
          <dd className="font-bold">{card.g ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-sm font-bold text-muted">Country of origin</dt>
          <dd className="font-bold">{card.c ?? "Not given"}</dd>
        </div>
        <div>
          <dt className="text-sm font-bold text-muted">Documents I have</dt>
          <dd>
            <ul className="list-disc ps-5">
              {card.d.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="text-sm font-bold text-muted">Arrive ID</dt>
          <dd className="font-mono text-2xl font-bold tracking-wider text-brand">{card.id}</dd>
        </div>
      </dl>
    </main>
  );
}

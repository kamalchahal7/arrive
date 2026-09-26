"use client";

import { CheckCircle2, Loader2, Mail, MapPin, MessageSquare, Phone, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ErrorNote } from "@/components/Notices";
import { api, errorCode } from "@/lib/api";
import { takeDraft } from "@/lib/handoff-draft";
import { getProfileId } from "@/lib/storage";
import type { ContactMethod } from "@/lib/types";

const METHODS: { id: ContactMethod; icon: typeof Phone }[] = [
  { id: "phone", icon: Phone },
  { id: "text", icon: MessageSquare },
  { id: "whatsapp", icon: MessageSquare },
  { id: "email", icon: Mail },
  { id: "in_person", icon: MapPin },
];

export default function HelpPage() {
  const t = useTranslations("Help");
  const locale = useLocale();
  const [need, setNeed] = useState("");
  const [topic, setTopic] = useState<string | undefined>();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [method, setMethod] = useState<ContactMethod>("phone");
  const [value, setValue] = useState("");
  const [time, setTime] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const draft = takeDraft();
    if (draft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the draft from sessionStorage after hydration
      setNeed(draft.need);
      setTopic(draft.topic);
      setRequestId(draft.requestId || null);
    }
  }, []);

  const needsValue = method !== "in_person";
  const valueIsEmail = method === "email";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setError("consent_required");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api<{ id: string; summary: string }>("/handoffs", {
        method: "POST",
        body: {
          need: need.trim(),
          language: locale,
          contact_method: method,
          contact_value: needsValue ? value.trim() : null,
          preferred_time: time.trim() || null,
          consent: true,
          profile_id: getProfileId() || undefined,
          request_id: requestId || undefined,
          topic,
        },
      });
      setSent(res.summary);
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 px-5 py-6">
        <div role="status" className="card flex flex-col gap-3 border-teal bg-teal-light">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-teal">
            <CheckCircle2 aria-hidden className="size-7" />
            {t("successTitle")}
          </h1>
          <p>{t("successBody")}</p>
          <blockquote dir="auto" className="rounded-xl bg-surface p-3">
            {sent}
          </blockquote>
        </div>
        <p className="font-bold text-danger-ink">{t("emergency")}</p>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p>{t("intro")}</p>
        <p className="font-bold text-danger-ink">{t("emergency")}</p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div>
          <label htmlFor="need" className="label">
            {t("needLabel")}
          </label>
          <textarea
            id="need"
            required
            dir="auto"
            rows={4}
            maxLength={2000}
            value={need}
            onChange={(e) => setNeed(e.target.value)}
            aria-describedby="need-hint"
            className="field text-lg"
          />
          <p id="need-hint" className="mt-1 text-sm text-muted">
            {t("needHint")}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="label">{t("contactLabel")}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {METHODS.map(({ id, icon: Icon }) => (
              <label
                key={id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-card border-2 px-4 font-bold ${
                  method === id ? "border-teal bg-teal-light text-teal" : "border-line bg-surface"
                }`}
              >
                <input type="radio" name="method" value={id} checked={method === id} onChange={() => setMethod(id)} className="size-5 accent-teal" />
                <Icon aria-hidden className="size-5" />
                {t(id)}
              </label>
            ))}
          </div>
        </fieldset>

        {needsValue && (
          <div>
            <label htmlFor="contact" className="label">
              {valueIsEmail ? t("emailValue") : t("phoneValue")}
            </label>
            <input
              id="contact"
              required
              dir="ltr"
              type={valueIsEmail ? "email" : "tel"}
              autoComplete={valueIsEmail ? "email" : "tel"}
              inputMode={valueIsEmail ? "email" : "tel"}
              maxLength={200}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="field text-lg"
            />
          </div>
        )}

        <div>
          <label htmlFor="time" className="label">
            {t("timeLabel")} <span className="font-normal text-muted">({t("optional")})</span>
          </label>
          <input id="time" dir="auto" maxLength={100} value={time} onChange={(e) => setTime(e.target.value)} placeholder={t("timePlaceholder")} className="field" />
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-card border-2 border-line bg-surface p-4">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-6 shrink-0 accent-teal" required />
          <span>{t("consent")}</span>
        </label>

        {error && <ErrorNote code={error} />}

        <button
          type="submit"
          className="btn btn-primary min-h-14 text-lg"
          disabled={pending || need.trim().length < 2 || !consent || (needsValue && !value.trim())}
        >
          {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Send aria-hidden className="size-5 rtl:-scale-x-100" />}
          {pending ? t("sending") : t("submit")}
        </button>
      </form>
    </main>
  );
}

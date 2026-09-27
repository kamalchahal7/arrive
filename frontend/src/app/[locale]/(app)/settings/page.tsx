"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useSettings } from "@/components/SettingsProvider";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api";
import { cacheProfile, clearAll, getCachedProfile, getProfileId } from "@/lib/storage";
import type { Profile } from "@/lib/types";
import type { A11ySettings } from "@/lib/storage";

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="flex flex-col">
        <span className="font-bold">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-9 w-16 shrink-0 items-center rounded-full border-2 ${checked ? "border-brand bg-brand" : "border-muted bg-surface"}`}
      >
        <span className={`absolute size-6 rounded-full ${checked ? "end-1 bg-white" : "start-1 bg-muted"}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tn = useTranslations("Nav");
  const tc = useTranslations("Common");
  const { settings, update } = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the profile lives in localStorage
    if (getProfileId()) setConsent(Boolean(getCachedProfile<Profile>()?.analytics_consent));
  }, []);

  const changeConsent = async (value: boolean) => {
    const id = getProfileId();
    if (!id) return;
    setConsent(value);
    try {
      cacheProfile(await api<Profile>(`/profile/${id}`, { method: "PATCH", body: { analytics_consent: value } }));
    } catch {
      setConsent(!value);
    }
  };

  const sizes: A11ySettings["textSize"][] = [1, 2, 3, 4];

  const deleteData = async () => {
    const id = getProfileId();
    if (id) {
      try {
        await api(`/profile/${id}`, { method: "DELETE" });
      } catch {
        /* still clear this device */
      }
    }
    clearAll();
    setConfirm(false);
    setDeleted(true);
  };

  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-6">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>

      <section className="card flex flex-col gap-3" aria-labelledby="size-label">
        <h2 id="size-label" className="font-bold">
          {t("textSize")}
        </h2>
        <div role="radiogroup" aria-labelledby="size-label" className="grid grid-cols-4 gap-2">
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={settings.textSize === s}
              onClick={() => update({ textSize: s })}
              className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 font-bold ${
                settings.textSize === s ? "border-brand bg-brand-light text-brand" : "border-line bg-surface"
              }`}
            >
              <span aria-hidden style={{ fontSize: `${0.9 + s * 0.25}rem` }}>
                A
              </span>
              <span className="text-xs">{t(`size${s}`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card divide-y divide-line !py-2">
        <Toggle id="contrast" label={t("highContrast")} hint={t("highContrastHint")} checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} />
        <Toggle id="simple" label={t("simpleMode")} hint={t("simpleModeHint")} checked={settings.simpleMode} onChange={(v) => update({ simpleMode: v })} />
        <Toggle id="autoread" label={t("autoRead")} checked={settings.autoRead} onChange={(v) => update({ autoRead: v })} />
        <Toggle id="motion" label={t("reduceMotion")} checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        <Toggle id="autolisten" label={t("autoListen")} checked={settings.autoListen} onChange={(v) => update({ autoListen: v })} />
        {consent !== null && (
          <Toggle id="consent" label={t("consent")} hint={t("consentHint")} checked={consent} onChange={(v) => void changeConsent(v)} />
        )}
      </section>

      <section className="card">
        <LanguageSwitcher />
      </section>

      <section className="card flex flex-col gap-3" aria-labelledby="delete-title">
        <h2 id="delete-title" className="font-bold">
          {t("deleteTitle")}
        </h2>
        <p className="text-muted">{t("deleteBody")}</p>
        {deleted ? (
          <p role="status" className="font-bold text-brand">
            {t("deleted")}
          </p>
        ) : confirm ? (
          <div role="alertdialog" aria-labelledby="confirm-text" className="flex flex-col gap-2">
            <p id="confirm-text" className="font-bold text-danger-ink">
              {t("deleteConfirm")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary !bg-danger-ink" onClick={deleteData} autoFocus>
                {t("deleteYes")}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
                {tc("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary self-start !border-danger-ink !text-danger-ink" onClick={() => setConfirm(true)}>
            <Trash2 aria-hidden className="size-5" />
            {t("deleteButton")}
          </button>
        )}
      </section>

      <Link href="/trust" className="btn btn-quiet self-start">
        {tn("trust")}
      </Link>
    </main>
  );
}

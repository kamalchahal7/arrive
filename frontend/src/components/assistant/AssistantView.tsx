"use client";

import { ArrowLeft, Keyboard } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/Avatar";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { languageInfo } from "@/config/languages";
import { Link } from "@/i18n/navigation";

// "Ask the avatar" (docs/REDESIGN.md section 8). First version: the ElevenLabs web agent and a link to typed
// questions. The avatar states, checklist tools and in-view text chat come in R5.
export function AssistantView() {
  const t = useTranslations("Assistant");
  const ta = useTranslations("Avatar");
  const locale = useLocale();
  const voice = languageInfo(locale).stt;
  return (
    <main id="main" className="mx-auto flex max-w-xl flex-col items-center gap-5 px-5 pt-4 pb-12 text-center">
      <Link href="/home" className="btn btn-quiet self-start !px-0">
        <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
        {t("back")}
      </Link>
      <Avatar state="idle" label={ta("idle")} />
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="text-lg">{t("intro")}</p>
      {voice ? <VoiceAssistant big /> : <p className="card bg-amber-light text-amber-ink">{t("textOnly")}</p>}
      <Link href="/ask" className="btn btn-secondary min-h-14 w-full text-lg">
        <Keyboard aria-hidden className="size-6" />
        {t("type")}
      </Link>
    </main>
  );
}

"use client";

import { ArrowLeft, FileText, Map, MessageCircle, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";

const NAV = [
  { href: "/roadmap", key: "roadmap", icon: Map },
  { href: "/ask", key: "ask", icon: MessageCircle },
  { href: "/letters", key: "letters", icon: FileText },
  { href: "/scam-check", key: "scam", icon: ShieldQuestion },
] as const;

export function AppHeader() {
  const t = useTranslations("Common");
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/home" lang="en" className="font-display text-2xl font-semibold text-brand" aria-label={t("appName")}>
          Arrive
        </Link>
        <LanguageSwitcher compact />
      </div>
    </header>
  );
}

// The old bottom navigation (Roadmap, Ask, Letters, Is it real?). Replaced by the home screen in the redesign
// (docs/REDESIGN.md section 2); kept here, unused, so it can come back if needed.
export function BottomNav() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-4">
        {NAV.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-sm font-bold ${
                  active ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-brand-light" : ""}`}
                >
                  <Icon aria-hidden className="size-6" strokeWidth={active ? 2.5 : 2} />
                </span>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Pages reached from "More help" (ask, letters, scam check, settings, trust, talk to a person): a way back home.
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Common");
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 pt-3">
        <Link href="/home" className="btn btn-quiet !px-0">
          <ArrowLeft aria-hidden className="size-5 rtl:-scale-x-100" />
          {t("backHome")}
        </Link>
      </div>
      <div className="pb-12">{children}</div>
    </>
  );
}

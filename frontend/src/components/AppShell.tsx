"use client";

import { FileText, Map, MessageCircle, Settings, ShieldQuestion } from "lucide-react";
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
        <Link href="/" lang="en" className="font-display text-2xl font-semibold text-teal" aria-label={t("appName")}>
          Arrive
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <Link href="/settings" className="btn btn-quiet !px-2" aria-label={t("settings")} title={t("settings")}>
            <Settings aria-hidden className="size-6" />
          </Link>
        </div>
      </div>
    </header>
  );
}

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
                  active ? "text-teal" : "text-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-8 w-12 items-center justify-center rounded-full ${active ? "bg-teal-light" : ""}`}
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

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <div className="pb-24">{children}</div>
      <BottomNav />
    </>
  );
}

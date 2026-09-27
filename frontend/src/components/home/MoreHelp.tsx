"use client";

import { ChevronDown, FileText, Info, LifeBuoy, Settings, ShieldQuestion, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";

// "More help" (docs/REDESIGN.md section 6): the tools that used to be in the bottom navigation.
const LINKS = [
  { href: "/help", key: "talk", icon: UserRound },
  { href: "/letters", key: "letter", icon: FileText },
  { href: "/scam-check", key: "scam", icon: ShieldQuestion },
  { href: "/settings", key: "settings", icon: Settings },
  { href: "/trust", key: "trust", icon: Info },
] as const;

export function MoreHelp() {
  const t = useTranslations("MoreHelp");
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="btn btn-secondary min-h-14"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <LifeBuoy aria-hidden className="size-5" />
        {t("title")}
        <ChevronDown aria-hidden className={`size-5 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={id} className="card absolute start-0 bottom-full z-20 mb-2 flex w-72 flex-col gap-1 !p-2 shadow-lg">
          {LINKS.map(({ href, key, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 font-bold hover:bg-teal-light">
                <Icon aria-hidden className="size-5 text-teal" />
                {t(key)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

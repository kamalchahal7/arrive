import { BarChart3, FileSearch, Inbox, LogOut, ShieldX } from "lucide-react";
import Link from "next/link";
import type { StaffUser } from "@/lib/staff-auth";

type Active = "inbox" | "insights" | "sources";

export function StaffShell({
  active,
  user,
  inboxCount,
  children,
}: {
  active: Active;
  user: StaffUser;
  inboxCount?: number;
  children: React.ReactNode;
}) {
  const items = [
    { id: "inbox", href: "/worker", label: "Handoff inbox", icon: Inbox, count: inboxCount, show: user.roles.some((r) => r === "settlement_worker" || r === "admin") },
    { id: "insights", href: "/insights", label: "Trends", icon: BarChart3, show: user.roles.some((r) => r === "gov_analyst" || r === "admin") },
    { id: "sources", href: "/worker/sources", label: "Official sources", icon: FileSearch, show: true },
  ].filter((i) => i.show);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="bg-sidebar text-white md:w-64 md:shrink-0">
        <div className="flex items-center justify-between gap-2 px-5 py-4 md:flex-col md:items-start">
          <Link href="/worker" className="font-display text-2xl font-semibold">
            Arrive <span className="text-sm font-normal text-white/80">for staff</span>
          </Link>
        </div>
        <nav aria-label="Staff">
          <ul className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
            {items.map(({ id, href, label, icon: Icon, count }) => (
              <li key={id}>
                <Link
                  href={href}
                  aria-current={active === id ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 font-bold whitespace-nowrap ${
                    active === id ? "bg-white/15" : "text-white/85 hover:bg-white/10"
                  }`}
                >
                  <Icon aria-hidden className="size-5" />
                  {label}
                  {count !== undefined && (
                    <span className="ms-auto rounded-full bg-amber-light px-2 text-sm text-amber-ink" aria-label={`${count} open`}>
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-white/15 px-5 py-3 text-sm">
          <p className="font-bold">{user.name}</p>
          <p className="text-white/80">{user.roles.join(", ") || "no role"}</p>
          {/* Plain link on purpose: Auth0 routes must not be prefetched by next/link. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/auth/logout" className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold underline">
            <LogOut aria-hidden className="size-4" />
            Sign out
          </a>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 md:px-8">
        {children}
      </main>
    </div>
  );
}

export function AccessDenied({ user, needed }: { user: StaffUser; needed: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5">
      <div className="card flex flex-col gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
          <ShieldX aria-hidden className="size-7 text-danger-ink" />
          You don&apos;t have access to this page
        </h1>
        <p>
          You are signed in as <strong>{user.email || user.name}</strong>, but this page needs the{" "}
          <strong>{needed.replace("_", " ")}</strong> role. Ask your Arrive administrator to add it to your account, then sign
          in again.
        </p>
        <div className="flex flex-wrap gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/auth/logout" className="btn btn-primary">
            Sign in with another account
          </a>
          <Link href="/en" className="btn btn-secondary">
            Go to the public app
          </Link>
        </div>
      </div>
    </main>
  );
}

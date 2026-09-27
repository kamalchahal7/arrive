import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { StaffShell } from "@/components/staff/StaffShell";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Official sources" };

type Source = {
  title: string;
  url: string;
  jurisdiction: string;
  topics: string[];
  last_fetched_at: string | null;
  last_changed_at: string | null;
  passages: number;
};

const BASE = process.env.API_INTERNAL_URL || "http://localhost:8000/api";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-CA", { dateStyle: "medium" }) : "Not yet");

export default async function SourcesPage() {
  // Any signed-in staff member can see which pages Arrive answers from.
  const { user } = await requireStaff("settlement_worker", "/worker/sources");
  let sources: Source[] = [];
  let failed = false;
  try {
    const res = await fetch(`${BASE}/sources`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    sources = (await res.json()) as Source[];
  } catch {
    failed = true;
  }

  return (
    <StaffShell active="sources" user={user}>
      <h1 className="font-display text-3xl font-semibold">Official sources</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Arrive answers only from these pages. They are re-checked every day; &quot;last changed&quot; shows when the page content
        changed, so steps linked to it can warn newcomers.
      </p>
      {failed && <p role="alert" className="card mt-4 bg-danger-light text-danger-ink">Could not load sources.</p>}
      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-start">
          <caption className="sr-only">Official sources used by Arrive</caption>
          <thead className="border-b border-line text-sm text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 text-start">Page</th>
              <th scope="col" className="px-4 py-3 text-start">Level</th>
              <th scope="col" className="px-4 py-3 text-start">Topics</th>
              <th scope="col" className="px-4 py-3 text-end">Passages</th>
              <th scope="col" className="px-4 py-3 text-start">Last checked</th>
              <th scope="col" className="px-4 py-3 text-start">Last changed</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.url} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-bold text-brand underline">
                    {s.title}
                    <ExternalLink aria-hidden className="mt-1 size-3.5 shrink-0" />
                  </a>
                </td>
                <td className="px-4 py-3 capitalize">{s.jurisdiction}</td>
                <td className="px-4 py-3 text-sm">{s.topics.join(", ").replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-end tabular-nums">{s.passages}</td>
                <td className="px-4 py-3 text-sm">{fmt(s.last_fetched_at)}</td>
                <td className="px-4 py-3 text-sm">{fmt(s.last_changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}

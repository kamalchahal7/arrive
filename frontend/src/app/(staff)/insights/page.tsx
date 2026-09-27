import { ExternalLink, FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { BriefPanel } from "@/components/staff/BriefPanel";
import { HouseholdInsights } from "@/components/staff/HouseholdInsights";
import { LanguagesChart, OverTimeChart, TopTopicsChart } from "@/components/staff/LazyCharts";
import { AccessDenied, StaffShell } from "@/components/staff/StaffShell";
import { type Confusing, type Gaps, type Languages, langName, type Overview, type OverTime, show } from "@/components/staff/insights-types";
import { StaffApiError, staffApi } from "@/lib/server-api";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Needs dashboard" };

const CHANNEL = { web: "Text", voice_web: "Voice" } as Record<string, string>;
const REGION = { ottawa: "Ottawa", ontario_other: "Elsewhere in Ontario", unknown: "Unknown" } as Record<string, string>;

function Stat({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="eyebrow">{label}</p>
      <p className="font-display text-4xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

function TableToggle({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-teal">Show as table</summary>
      <div className="overflow-x-auto">{children}</div>
    </details>
  );
}

export default async function InsightsPage() {
  const { user, allowed } = await requireStaff("gov_analyst", "/insights");
  if (!allowed) return <AccessDenied user={user} needed="gov_analyst" />;

  let data: [Overview, OverTime, Languages, Gaps, Confusing] | null = null;
  let error: string | null = null;
  try {
    data = await Promise.all([
      staffApi<Overview>("/insights/overview"),
      staffApi<OverTime>("/insights/over-time?weeks=8"),
      staffApi<Languages>("/insights/languages?weeks=8"),
      staffApi<Gaps>("/insights/gaps?days=30"),
      staffApi<Confusing>("/insights/confusing-sources?days=30"),
    ]);
  } catch (err) {
    error = err instanceof StaffApiError ? err.code : "internal_error";
  }

  if (!data) {
    return (
      <StaffShell active="insights" user={user}>
        <h1 className="font-display text-3xl font-semibold">Needs dashboard</h1>
        <p role="alert" className="card mt-4 bg-danger-light text-danger-ink">Could not load insights ({error}).</p>
      </StaffShell>
    );
  }
  const [overview, overTime, languages, gaps, confusing] = data;
  const c = overview.cards;
  const channelTotal = overview.channel_mix.reduce((s, r) => s + (typeof r.count === "number" ? r.count : 0), 0);
  const spikes = overview.top_topics.filter((t) => t.spike);

  return (
    <StaffShell active="insights" user={user}>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-2 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl font-semibold">Needs dashboard</h1>
            {overview.has_sample_data && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-light px-3 py-1 text-sm font-bold text-amber-ink">
                <FlaskConical aria-hidden className="size-4" />
                Sample data
              </span>
            )}
          </div>
          <p className="max-w-3xl text-muted">
            What newcomers in Ottawa asked Arrive, anonymized and aggregated. No questions, names or contact details are stored. Groups
            smaller than {overview.min_group_size} are shown as &quot;&lt;{overview.min_group_size}&quot;. Last 7 days compared with the 7 days before.
          </p>
        </header>

        <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:hidden">
          <Stat
            label="Requests this week"
            value={show(c.total_this_week)}
            note={
              c.total_change_pct !== null && (
                <span className="inline-flex items-center gap-1">
                  {c.total_change_pct >= 0 ? <TrendingUp aria-hidden className="size-4" /> : <TrendingDown aria-hidden className="size-4" />}
                  {c.total_change_pct > 0 ? "+" : ""}
                  {c.total_change_pct}% vs last week
                </span>
              )
            }
          />
          <Stat label="Answered from official sources" value={c.answered_rate !== null ? `${Math.round(c.answered_rate * 100)}%` : "—"} />
          <Stat label="Handed to a person" value={show(c.handoffs)} note={`Scam warnings: ${show(c.scam_flags)}`} />
          <Stat label="Top language" value={c.top_language ? langName(c.top_language) : "—"} />
        </section>

        <section aria-labelledby="topics-title" className="card print:hidden">
          <h2 id="topics-title" className="text-lg font-bold">Top topics this week</h2>
          {spikes.length > 0 && (
            <p className="mt-1 flex items-center gap-2 font-bold text-amber-ink">
              <TrendingUp aria-hidden className="size-5" />
              Spike: {spikes.map((s) => `${s.label}${s.change_pct !== null ? ` (${s.change_pct > 0 ? "+" : ""}${s.change_pct}%)` : ""}`).join(", ")}
            </p>
          )}
          <p className="mb-3 text-sm text-muted">Orange bars with “▲ spike” grew by at least 50% compared with last week.</p>
          <TopTopicsChart topics={overview.top_topics} />
          <TableToggle>
            <table className="w-full min-w-[28rem]">
              <thead><tr className="text-muted"><th className="py-1 text-start">Topic</th><th className="text-end">This week</th><th className="text-end">Last week</th><th className="text-end">Change</th></tr></thead>
              <tbody>
                {overview.top_topics.map((t) => (
                  <tr key={t.topic} className="border-t border-line">
                    <td className="py-1">{t.label}{t.spike && " (spike)"}</td>
                    <td className="text-end tabular-nums">{show(t.this_week)}</td>
                    <td className="text-end tabular-nums">{show(t.last_week)}</td>
                    <td className="text-end tabular-nums">{t.change_pct !== null ? `${t.change_pct}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableToggle>
        </section>

        <div className="grid gap-6 xl:grid-cols-2 print:hidden">
          <section aria-labelledby="time-title" className="card">
            <h2 id="time-title" className="text-lg font-bold">Requests over time</h2>
            <p className="mb-3 text-sm text-muted">Weekly totals, last 8 weeks.</p>
            <OverTimeChart weeks={overTime.weeks} />
            <TableToggle>
              <table className="w-full">
                <thead><tr className="text-muted"><th className="py-1 text-start">Week of</th><th className="text-end">All</th><th className="text-end">Answered</th><th className="text-end">Handed off</th></tr></thead>
                <tbody>
                  {overTime.weeks.map((w) => (
                    <tr key={w.week} className="border-t border-line">
                      <td className="py-1">{w.week}</td>
                      <td className="text-end tabular-nums">{show(w.total)}</td>
                      <td className="text-end tabular-nums">{show(w.answered)}</td>
                      <td className="text-end tabular-nums">{show(w.handed_off)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableToggle>
          </section>

          <section aria-labelledby="lang-title" className="card">
            <h2 id="lang-title" className="text-lg font-bold">Language demand this week</h2>
            <p className="mb-3 text-sm text-muted">Which languages people used. Helps plan interpreters and translated pages.</p>
            <LanguagesChart rows={overview.languages_this_week} />
            <TableToggle>
              <table className="w-full">
                <thead><tr className="text-muted"><th className="py-1 text-start">Region</th><th className="text-start">Languages (last 8 weeks)</th></tr></thead>
                <tbody>
                  {languages.by_region.map((r) => (
                    <tr key={r.region} className="border-t border-line align-top">
                      <td className="py-1 pe-3">{REGION[r.region] || r.region}</td>
                      <td>{r.languages.map((l) => `${langName(l.language)} ${show(l.count)}`).join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableToggle>
          </section>
        </div>

        <section aria-labelledby="channel-title" className="card print:hidden">
          <h2 id="channel-title" className="text-lg font-bold">How people reached Arrive</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {overview.channel_mix.map((r) => {
              const pct = typeof r.count === "number" && channelTotal ? Math.round((r.count / channelTotal) * 100) : null;
              return (
                <li key={r.channel} className="grid grid-cols-[9rem_1fr_5rem] items-center gap-3">
                  <span className="font-bold">{CHANNEL[r.channel] || r.channel}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-line" aria-hidden>
                    <span className="block h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: "#2a78d6" }} />
                  </span>
                  <span className="text-end tabular-nums">{pct !== null ? `${pct}%` : show(r.count)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="grid gap-6 xl:grid-cols-2 print:hidden">
          <section aria-labelledby="gaps-title" className="card">
            <h2 id="gaps-title" className="text-lg font-bold">Knowledge gaps</h2>
            <p className="mb-3 text-sm text-muted">Questions official pages could not answer (last {gaps.days} days), grouped by theme.</p>
            {gaps.themes.length === 0 ? (
              <p>No gaps recorded yet.</p>
            ) : (
              <table className="w-full">
                <caption className="sr-only">Knowledge gaps by theme</caption>
                <thead><tr className="text-sm text-muted"><th className="py-1 text-start">Theme</th><th className="text-end">Requests</th></tr></thead>
                <tbody>
                  {gaps.themes.map((g) => (
                    <tr key={g.theme} className="border-t border-line align-top">
                      <td className="py-2 pe-3">
                        <p className="font-bold">{g.theme}</p>
                        {g.examples.length > 0 && <p className="text-sm text-muted">e.g. {g.examples.join("; ")}</p>}
                      </td>
                      <td className="py-2 text-end tabular-nums">{show(g.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="confusing-title" className="card">
            <h2 id="confusing-title" className="text-lg font-bold">Confusing official pages</h2>
            <p className="mb-3 text-sm text-muted">Pages behind answers that people rated &quot;not clear&quot;.</p>
            {confusing.sources.length === 0 ? (
              <p>No ratings yet.</p>
            ) : (
              <table className="w-full">
                <caption className="sr-only">Official pages rated unclear</caption>
                <thead><tr className="text-sm text-muted"><th className="py-1 text-start">Page</th><th className="text-end">Used</th><th className="text-end">Not clear</th></tr></thead>
                <tbody>
                  {confusing.sources.map((s) => (
                    <tr key={s.url} className="border-t border-line align-top">
                      <td className="py-2 pe-3">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-bold text-teal underline">
                          {s.title}
                          <ExternalLink aria-hidden className="mt-1 size-3.5 shrink-0" />
                        </a>
                      </td>
                      <td className="py-2 text-end tabular-nums">{show(s.uses)}</td>
                      <td className="py-2 text-end tabular-nums">
                        {show(s.unclear)}
                        {s.unclear_rate !== null && <span className="text-muted"> ({Math.round(s.unclear_rate * 100)}%)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <section aria-labelledby="household-insights" className="flex flex-col gap-3">
          <h2 id="household-insights" className="font-display text-2xl font-semibold">Household checklist and programs</h2>
          <HouseholdInsights />
        </section>

        <BriefPanel />
      </div>
    </StaffShell>
  );
}

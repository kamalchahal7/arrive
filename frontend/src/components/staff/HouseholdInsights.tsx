// Needs dashboard additions for the redesign (docs/REDESIGN.md section 9). Server component: data comes from
// /api/insights/programs, /checklist and /survey, already aggregated and suppressed by the backend.

import { StaffApiError, staffApi } from "@/lib/server-api";
import { type Count, langName, show } from "./insights-types";

type ProgramInterest = {
  by_language: { program: string; title: string; language: string; count: Count }[];
  by_country: { program: string; title: string; country: string; count: Count }[];
};
type ChecklistStats = {
  stall_days: number;
  items: { item: string; title: string; views: Count; done: Count; staff_cards: Count; stalled: Count; done_rate: number | null }[];
  essential_times: { item: string; title: string; completed: Count; median_days: number | null }[];
};
type Survey = {
  weeks: { week: string; language: string; responses: Count; satisfaction: number | null }[];
  missing_themes: { theme: string; count: Count; examples: string[] }[];
};

const country = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: React.ReactNode[][] }) {
  if (!rows.length) return <p className="text-muted">No data yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted">
            {head.map((h, i) => (
              <th key={h} className={`py-1 ${i ? "text-end" : "text-start"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {r.map((cell, j) => (
                <td key={j} className={`py-2 ${j ? "text-end tabular-nums" : "pe-3"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function HouseholdInsights() {
  let programs: ProgramInterest, checklist: ChecklistStats, survey: Survey;
  try {
    [programs, checklist, survey] = await Promise.all([
      staffApi<ProgramInterest>("/insights/programs?weeks=12"),
      staffApi<ChecklistStats>("/insights/checklist?weeks=12"),
      staffApi<Survey>("/insights/survey?weeks=12"),
    ]);
  } catch (err) {
    const code = err instanceof StaffApiError ? err.code : "internal_error";
    return (
      <p role="alert" className="card bg-amber-light text-amber-ink">
        Household checklist insights are not available ({code}). Run the database migrations (006) first.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card" aria-labelledby="hi-programs">
        <h2 id="hi-programs" className="text-xl font-bold">Program interest by language</h2>
        <p className="mb-2 text-sm text-muted">&quot;I&apos;m interested&quot; taps, last 12 weeks.</p>
        <Table
          caption="Program interest by language"
          head={["Program", "Language", "Interested"]}
          rows={programs.by_language.slice(0, 15).map((r) => [r.title, langName(r.language), show(r.count)])}
        />
        {programs.by_country.length > 0 && (
          <>
            <h3 className="mt-4 font-bold">By country of origin (people who consented)</h3>
            <Table
              caption="Program interest by country of origin"
              head={["Program", "Country", "Interested"]}
              rows={programs.by_country.slice(0, 10).map((r) => [r.title, country(r.country), show(r.count)])}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="hi-bottlenecks">
        <h2 id="hi-bottlenecks" className="text-xl font-bold">Checklist bottlenecks</h2>
        <p className="mb-2 text-sm text-muted">
          Stalled = people who opened the step more than {checklist.stall_days} days ago and have not finished it.
        </p>
        <Table
          caption="Checklist bottlenecks"
          head={["Step", "Opened", "Done", "Stalled"]}
          rows={checklist.items.slice(0, 12).map((r) => [
            r.title,
            show(r.views),
            <>
              {show(r.done)}
              {r.done_rate !== null && <span className="text-muted"> ({Math.round(r.done_rate * 100)}%)</span>}
            </>,
            show(r.stalled),
          ])}
        />
      </section>

      <section className="card" aria-labelledby="hi-times">
        <h2 id="hi-times" className="text-xl font-bold">Time to finish essential steps</h2>
        <Table
          caption="Median days to finish essential steps"
          head={["Step", "Finished", "Median days"]}
          rows={checklist.essential_times.map((r) => [r.title, show(r.completed), r.median_days ?? "—"])}
        />
      </section>

      <section className="card" aria-labelledby="hi-survey">
        <h2 id="hi-survey" className="text-xl font-bold">End-of-session survey</h2>
        <Table
          caption="Satisfaction by week and language"
          head={["Week", "Language", "Answers", "Satisfaction (1-5)"]}
          rows={survey.weeks.slice(-12).map((r) => [r.week, langName(r.language), show(r.responses), r.satisfaction ?? "—"])}
        />
        <h3 className="mt-4 font-bold">What people say is missing</h3>
        <ul className="mt-1 flex flex-col gap-2">
          {survey.missing_themes.slice(0, 8).map((t) => (
            <li key={t.theme}>
              <span className="font-bold">{t.theme}</span> <span className="text-muted">({show(t.count)})</span>
            </li>
          ))}
          {survey.missing_themes.length === 0 && <li className="text-muted">No answers yet.</li>}
        </ul>
      </section>
    </div>
  );
}

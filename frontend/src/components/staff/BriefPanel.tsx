"use client";

import { FileText, Loader2, Printer } from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { generateBrief } from "@/app/(staff)/insights/actions";

// Tiny Markdown renderer for the brief (headings, bullets, bold, paragraphs). The text is rendered as
// React text nodes, never as HTML, so nothing in it can inject markup.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function Markdown({ source }: { source: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="list-disc ps-6">
          {list.map((li, i) => <li key={i}>{inline(li)}</li>)}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("# ")) blocks.push(<h2 key={blocks.length} className="font-display text-2xl font-semibold">{inline(line.slice(2))}</h2>);
    else if (line.startsWith("## ")) blocks.push(<h3 key={blocks.length} className="mt-2 text-lg font-bold">{inline(line.slice(3))}</h3>);
    else if (line.startsWith("### ")) blocks.push(<h4 key={blocks.length} className="font-bold">{inline(line.slice(4))}</h4>);
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

export function BriefPanel() {
  const [pending, start] = useTransition();
  const [brief, setBrief] = useState<{ markdown: string; has_sample_data: boolean; generated_at: string } | null>(null);
  const [error, setError] = useState(false);

  return (
    <section aria-labelledby="brief-title" className="card flex flex-col gap-3 print:border-0 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 id="brief-title" className="text-lg font-bold">
          Needs brief
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(false);
                try {
                  setBrief(await generateBrief());
                } catch {
                  setError(true);
                }
              })
            }
          >
            {pending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <FileText aria-hidden className="size-5" />}
            {pending ? "Writing the brief…" : "Generate needs brief"}
          </button>
          {brief && (
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Printer aria-hidden className="size-5" />
              Print
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted print:hidden">
        A one-page summary written by Gemini from the aggregated numbers on this page only. Small groups stay hidden.
      </p>
      {error && <p role="alert" className="text-danger-ink">Could not write the brief. Try again.</p>}
      {brief && (
        <article aria-live="polite" className="print-brief rounded-xl border border-line p-4">
          {brief.has_sample_data && <p className="mb-2 inline-block rounded bg-amber-light px-2 font-bold text-amber-ink">Includes sample data</p>}
          <Markdown source={brief.markdown} />
          <p className="mt-3 text-sm text-muted">Generated {new Date(brief.generated_at).toLocaleString("en-CA")} by Arrive.</p>
        </article>
      )}
    </section>
  );
}

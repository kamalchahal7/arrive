import { AlertTriangle, CalendarClock, Clock, Mail, MapPin, MessageSquare, Phone, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied, StaffShell } from "@/components/staff/StaffShell";
import { HandoffActions } from "@/components/staff/HandoffActions";
import { StaffApiError, staffApi } from "@/lib/server-api";
import { requireStaff } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Handoff inbox" };

type Handoff = {
  id: string;
  created_at: string;
  language: string;
  topic: string;
  summary: string;
  summary_native: string | null;
  already_done: string | null;
  household: string | null;
  status_category: string;
  contact_method: "phone" | "text" | "whatsapp" | "email" | "in_person";
  contact_value: string | null;
  preferred_time: string | null;
  status: "new" | "in_progress" | "resolved";
  assigned_to: string | null;
  urgency: "normal" | "high" | "emergency";
  deadline: string | null;
  channel: string;
  is_sample: boolean;
};

const LANG = new Intl.DisplayNames(["en"], { type: "language" });
const langName = (code: string) => {
  try {
    return LANG.of(code) || code;
  } catch {
    return code;
  }
};
const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const CONTACT_ICON = { phone: Phone, text: MessageSquare, whatsapp: MessageSquare, email: Mail, in_person: MapPin };
const URGENCY_STYLE = {
  emergency: "bg-danger-light text-danger-ink",
  high: "bg-amber-light text-amber-ink",
  normal: "bg-teal-light text-teal",
};

function waiting(created: string): string {
  const hours = Math.max(0, Math.round((Date.now() - new Date(created).getTime()) / 3_600_000));
  return hours < 24 ? `${hours} h waiting` : `${Math.round(hours / 24)} d waiting`;
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date + "T23:59:59").getTime() - Date.now()) / 86_400_000);
}

export default async function WorkerPage({ searchParams }: PageProps<"/worker">) {
  const { user, allowed } = await requireStaff("settlement_worker", "/worker");
  if (!allowed) return <AccessDenied user={user} needed="settlement_worker" />;

  let handoffs: Handoff[] = [];
  let error: string | null = null;
  try {
    handoffs = await staffApi<Handoff[]>("/worker/handoffs");
  } catch (err) {
    error = err instanceof StaffApiError ? err.code : "internal_error";
  }
  const params = await searchParams;
  const selectedId = typeof params.id === "string" ? params.id : undefined;
  const open = handoffs.filter((h) => h.status !== "resolved");
  const selected = handoffs.find((h) => h.id === selectedId) || open[0];

  return (
    <StaffShell active="inbox" user={user} inboxCount={open.length}>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">Handoff inbox</h1>
        <p className="text-muted">
          Newcomers who asked to talk to a person. Sorted by urgency, then deadline, then time waiting. People gave consent to share
          these details with you.
        </p>
      </div>

      {error && (
        <p role="alert" className="card mt-4 bg-danger-light text-danger-ink">
          Could not load the inbox ({error}). Check that the backend is running and your account has the settlement_worker role.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="list-title">
          <h2 id="list-title" className="sr-only">
            Requests
          </h2>
          {handoffs.length === 0 && !error && <p className="card">No requests yet. New requests from the app appear here.</p>}
          <ul className="flex flex-col gap-2">
            {handoffs.map((h) => {
              const Icon = CONTACT_ICON[h.contact_method];
              const isSel = selected?.id === h.id;
              return (
                <li key={h.id}>
                  <Link
                    href={`/worker?id=${h.id}`}
                    aria-current={isSel ? "true" : undefined}
                    className={`card flex flex-col gap-2 !p-4 hover:border-teal ${isSel ? "!border-2 !border-teal" : ""} ${h.status === "resolved" ? "opacity-70" : ""}`}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${URGENCY_STYLE[h.urgency]}`}>
                        {h.urgency === "normal" ? "Normal" : h.urgency === "high" ? "High" : "Emergency"}
                      </span>
                      <span className="font-bold">{langName(h.language)}</span>
                      <span className="text-muted">· {label(h.topic)}</span>
                      {h.status !== "new" && <span className="text-muted">· {label(h.status)}</span>}
                      {h.is_sample && <span className="rounded bg-line px-1.5 text-xs font-bold">Sample</span>}
                    </span>
                    <span className="line-clamp-2">{h.summary}</span>
                    <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Icon aria-hidden className="size-4" />
                        {label(h.contact_method)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden className="size-4" />
                        {waiting(h.created_at)}
                      </span>
                      {h.household && (
                        <span className="inline-flex items-center gap-1">
                          <Users aria-hidden className="size-4" />
                          {h.household}
                        </span>
                      )}
                      {h.deadline && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-ink">
                          <CalendarClock aria-hidden className="size-4" />
                          Deadline in {daysUntil(h.deadline)} days
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {selected && (
          <section aria-labelledby="detail-title" className="card flex h-fit flex-col gap-4 lg:sticky lg:top-6">
            <div className="flex flex-col gap-1">
              <p className="eyebrow">
                {langName(selected.language)} · {label(selected.topic)} · {label(selected.status_category)} · via {label(selected.channel)}
              </p>
              <h2 id="detail-title" className="font-display text-2xl font-semibold">
                What they need
              </h2>
            </div>
            {selected.urgency !== "normal" && (
              <p className={`flex items-center gap-2 rounded-xl p-3 font-bold ${URGENCY_STYLE[selected.urgency]}`}>
                <AlertTriangle aria-hidden className="size-5" />
                {selected.urgency === "emergency" ? "Emergency: they may be in danger." : "High urgency"}
                {selected.deadline && ` · deadline ${selected.deadline}`}
              </p>
            )}
            <p className="text-lg">{selected.summary}</p>
            {selected.summary_native && (
              <div>
                <p className="eyebrow">In their language (what they saw)</p>
                <p dir="auto" lang={selected.language}>
                  {selected.summary_native}
                </p>
              </div>
            )}
            {selected.already_done && (
              <div>
                <p className="eyebrow">What they already did</p>
                <p>{selected.already_done}</p>
              </div>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="font-bold">Contact</dt>
              <dd>
                {label(selected.contact_method)}
                {selected.contact_value && (
                  <>
                    : <span dir="ltr">{selected.contact_value}</span>
                  </>
                )}
              </dd>
              {selected.preferred_time && (
                <>
                  <dt className="font-bold">Best time</dt>
                  <dd>{selected.preferred_time}</dd>
                </>
              )}
              {selected.household && (
                <>
                  <dt className="font-bold">Household</dt>
                  <dd>{selected.household}</dd>
                </>
              )}
              <dt className="font-bold">Assigned</dt>
              <dd>{selected.assigned_to || "Nobody yet"}</dd>
              <dt className="font-bold">Received</dt>
              <dd>{new Date(selected.created_at).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</dd>
            </dl>
            <HandoffActions
              id={selected.id}
              status={selected.status}
              contactMethod={selected.contact_method}
              contactValue={selected.contact_value}
            />
          </section>
        )}
      </div>
    </StaffShell>
  );
}

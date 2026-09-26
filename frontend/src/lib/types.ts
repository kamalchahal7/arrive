// Shapes returned by the Arrive API (backend/app/models, backend/app/routers).

export type SourceRef = {
  id: number;
  source_id: number;
  title: string;
  url: string;
  section: string | null;
  last_checked: string | null;
};

export type AskResponse = {
  request_id: string | null;
  status: "answered" | "not_found" | "handoff_suggested";
  language: string;
  topic: string;
  urgency: "normal" | "high" | "emergency";
  emergency: boolean;
  emergency_message: string | null;
  possible_scam: boolean;
  answer: string | null;
  steps: string[];
  sources: SourceRef[];
  follow_ups: string[];
  message: string | null;
  handoff_suggested: boolean;
  handoff_reason: "case_specific" | "not_found" | "urgent" | null;
  disclaimer: string | null;
};

export type Status = "refugee_pr" | "international_student" | "unknown";

export type Profile = {
  id: string;
  status: string;
  arrival_date: string | null;
  city: string;
  province: string;
  has_children: boolean | null;
  has_seniors: boolean | null;
  languages: string[];
  preferred_language: string;
  needs: string[];
  created_at: string;
};

export type ProfileInput = Partial<Omit<Profile, "id" | "created_at">>;

export type Step = {
  id: string;
  template_id: string | null;
  custom: boolean;
  title: string;
  summary: string;
  documents: string[];
  where: string;
  timing_label: string;
  due_date: string | null;
  status: "todo" | "done" | "skipped";
  is_now: boolean;
  topic: string;
  source: { url: string; title: string | null; last_checked: string | null } | null;
  unlocks: { id: string; title: string }[];
  reviewed: boolean;
  rule_may_have_changed: boolean;
};

export type Roadmap = {
  profile_id: string;
  language: string;
  weeks_since_arrival: number | null;
  done: number;
  total: number;
  steps: Step[];
};

export type LetterResult = {
  sender: string;
  sender_confidence: "high" | "medium" | "low";
  what_it_means: string;
  action_needed: boolean;
  deadline: string | null;
  deadline_iso: string | null;
  steps: string[];
  amount_owed: string | null;
  looks_suspicious: boolean;
  suspicious_reasons: string[];
  topic: string;
  short_title: string;
  disclaimer: string;
};

export type ScamResult = {
  request_id: string | null;
  verdict: "likely_scam" | "likely_real" | "unsure";
  verdict_text: string;
  reasons: string[];
  what_to_do: string[];
  government_never: string[];
  sources: SourceRef[];
  report_url: string | null;
};

export type CardSide = {
  language: string;
  greeting: string;
  purpose_label: string;
  purpose: string;
  documents_label: string;
  documents: string[];
  language_note: string;
  thanks: string;
};

export type StaffCard = { official: CardSide; native: CardSide };

export type ContactMethod = "phone" | "text" | "whatsapp" | "email" | "in_person";

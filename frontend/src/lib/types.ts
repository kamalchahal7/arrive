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

export type Gender = "man" | "woman" | "another" | "prefer_not_to_say";

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
  // Household profile (docs/REDESIGN.md section 4). public_id is the readable ID the person sees.
  public_id: string | null;
  first_name: string | null;
  city_name: string | null;
  country_of_origin: string | null;
  gender: Gender | null;
  self_age_group: "adult" | "senior";
  adults: number;
  seniors: number;
  children_0_5: number;
  children_6_17: number;
  disability_adult: boolean | null;
  disability_senior: boolean | null;
  disability_child: boolean | null;
  other_languages: string[];
  analytics_consent: boolean;
  /** Kept on this phone only: the country as the person said it (shown when it has no ISO code). */
  country_text?: string | null;
};

export type ProfileInput = Partial<Omit<Profile, "id" | "created_at" | "public_id">>;

/** The ID to keep on the device: the readable one when there is one. */
export const profileRef = (p: Pick<Profile, "id" | "public_id">): string => p.public_id || p.id;

export type OnboardingQuestion =
  | "first_name"
  | "city"
  | "country_of_origin"
  | "gender"
  | "self_age"
  | "household"
  | "disability";

export type OnboardingAnswer = {
  question_key: OnboardingQuestion;
  understood: boolean;
  declined: boolean;
  value: Record<string, unknown>;
  confirmation: string;
  heard: string;
};

export type ChecklistRow = {
  item_id: string;
  person_key: string;
  person_label: string;
  title: string;
  summary: string;
  essential: boolean;
  in_person: boolean;
  status: "todo" | "done";
  completed_at: string | null;
};

export type ChecklistPhase = { id: string; label: string; done: number; total: number; items: ChecklistRow[] };

export type Checklist = {
  profile_id: string;
  language: string;
  done: number;
  total: number;
  current_phase: string | null;
  notes: string[];
  phases: ChecklistPhase[];
};

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

export type Place = {
  name: string;
  institution: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  lat: number | null;
  lon: number | null;
  map_query: string | null;
  photo: string | null;
  verified: boolean;
};

export type ItemDetail = {
  id: string;
  kind: "checklist" | "program";
  language: string;
  title: string;
  summary: string;
  level: string;
  phase: string | null;
  phase_label: string | null;
  group: string | null;
  essential: boolean;
  in_person: boolean;
  documents: string[];
  steps: string[];
  eligibility: string[];
  how_to_apply: string[];
  notes: string[];
  location: Place | null;
  source: { url: string; title: string | null; last_checked: string | null } | null;
  staff_card: boolean;
  rows: { person_key: string; person_label: string; status: "todo" | "done" }[];
  reviewed: boolean;
  disclaimer: string;
};

export type ProgramSummary = { id: string; group: string; level: string; title: string; summary: string; has_location: boolean };

export type Programs = { profile_id: string; language: string; notes: string[]; programs: ProgramSummary[] };

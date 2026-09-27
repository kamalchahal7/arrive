// Aba, the voice helper: one ElevenLabs agent session pipeline for the whole app.
// - "chat" (Ask Aba): Aba answers from the Ottawa reference data below, by name, in the person's language.
// - "listen" (onboarding answers, end-of-session survey): a silent session that only returns what the person said.
// Both use the same agent, voice and speech-to-text, started with a short-lived token from /api/voice/session.

import { CHECKLIST, DOCUMENTS } from "@/data/checklist";
import { PROGRAMS } from "@/data/programs";
import { languageInfo } from "@/config/languages";
import { api } from "./api";

export type AbaSession = { agent_id: string; conversation_token?: string; signed_url?: string };

export type AbaProfile = {
  first_name?: string | null;
  city_name?: string | null;
  self_age_group?: string | null;
  adults?: number;
  seniors?: number;
  children_0_5?: number;
  children_6_17?: number;
  disability?: boolean;
} | null;

/** The Ottawa checklist and programs as plain English text, so Aba answers with real addresses and phones. */
export function referenceText(): string {
  const place = (p: { name: string; address: string | null; phone: string | null; hours: string | null }) =>
    [p.name, p.address, p.phone && `phone ${p.phone}`, p.hours].filter(Boolean).join(", ");
  const items = CHECKLIST.map(
    (i) =>
      `- ${i.title.en} (${i.phase}, for ${i.who}): ${i.summary.en} Where: ${i.places.map(place).join(" | ")}. ` +
      `Bring: ${i.documents.map((d) => DOCUMENTS[d].en).join("; ")}.`,
  );
  const programs = PROGRAMS.map((p) => `- ${p.title.en} (${p.group}): ${p.description.en} ${p.places.map(place).join(" | ")}.`);
  return `CHECKLIST ITEMS\n${items.join("\n")}\n\nGOVERNMENT-RUN PROGRAMS\n${programs.join("\n")}`;
}

function familyText(p: AbaProfile): string {
  if (!p) return "unknown";
  const parts = [
    p.adults ? `${p.adults} adult(s)` : "",
    p.seniors ? `${p.seniors} senior(s) 65+` : "",
    p.children_0_5 ? `${p.children_0_5} child(ren) aged 0-5` : "",
    p.children_6_17 ? `${p.children_6_17} child(ren) aged 6-17` : "",
    p.disability ? "someone with a disability or long-term health condition" : "",
  ].filter(Boolean);
  const total = (p.adults ?? 0) + (p.seniors ?? 0) + (p.children_0_5 ?? 0) + (p.children_6_17 ?? 0);
  return parts.length ? `${total} people in total, the person included: ${parts.join(", ")}` : "unknown";
}

export function chatPrompt(locale: string, profile: AbaProfile): string {
  const language = languageInfo(locale).englishName;
  const name = profile?.first_name?.trim();
  return `You are Aba, a warm and calm helper for government-assisted refugees who just arrived in Ottawa, Canada.
${name ? `The person's name is ${name}. Use their name when you greet them and now and then after.` : "You do not know the person's name."}
They speak ${language}. Always answer in ${language}, unless they speak to you in another language.
Their family: ${familyText(profile)}.

How to answer:
1. Answer directly and confidently in two or three short sentences, in plain words. Never start with a preamble, a
   disclaimer, "I'm not sure" or "this information is not available". Just give the answer.
2. For addresses, phone numbers, opening hours and documents, use ONLY the Ottawa information below. Say phone numbers
   slowly, digit by digit.
3. If the answer is truly not in the information below, say one short sentence: they can call 2-1-1 (211 Ontario) or
   ask their settlement agency. No long explanations.
4. If someone is in danger or has a medical emergency, tell them to call 9-1-1 first.
5. Never decide their immigration case for them; for that, their settlement agency can help.
6. No lists, no web addresses, no markdown. Do not use tools.

OTTAWA INFORMATION
${referenceText()}`;
}

const LISTEN_PROMPT =
  "You are a silent listener. Never ask questions and never explain anything. After the person speaks, reply with exactly one word: OK.";

export type Mode = "chat" | "listen";

/** The options for conversation.startSession: token, overrides and the variables the agent expects. */
export async function sessionOptions(mode: Mode, locale: string, extra: { profile?: AbaProfile; greeting?: string; profileId?: string | null; textOnly?: boolean } = {}) {
  const session = await api<AbaSession>("/voice/session");
  const prompt = mode === "chat" ? chatPrompt(locale, extra.profile ?? null) : LISTEN_PROMPT;
  const overrides = {
    agent: {
      // tool_ids: [] removes the agent's server tools: Aba answers from the data in the prompt.
      prompt: { prompt, tool_ids: [] } as { prompt: string },
      firstMessage: mode === "chat" ? (extra.greeting ?? "") : "",
      language: locale as "en",
    },
    ...(extra.textOnly ? { conversation: { textOnly: true } } : {}),
  };
  const base = {
    overrides,
    dynamicVariables: { channel: "voice_web", language: locale, profile_id: extra.profileId || "" },
    ...(extra.textOnly ? { textOnly: true } : {}),
  };
  if (session.conversation_token) return { ...base, conversationToken: session.conversation_token, connectionType: "webrtc" as const };
  if (session.signed_url) return { ...base, signedUrl: session.signed_url, connectionType: "websocket" as const };
  throw new Error("no session");
}

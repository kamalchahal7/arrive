// What the staff card says to the clerk, in English and French (docs/REDESIGN.md 7.2). Human-written so the card
// reads the same on every phone, including the clerk's after scanning the QR code. The person's own language comes
// from messages/<locale>.json (StaffCard namespace). French is a draft for review [VERIFY: native speaker].

import { languageName } from "./languages";

/** The task, as the person would say it to the clerk, for each in-person essential item. `many` when the item
 *  is for several people (e.g. two children to register). */
export const TASKS: Record<string, { en: string; fr: string; enMany?: string; frMany?: string }> = {
  sin: {
    en: "apply for my Social Insurance Number (SIN)",
    fr: "demander mon numéro d'assurance sociale (NAS)",
    enMany: "apply for Social Insurance Numbers (SIN) for my family",
    frMany: "demander des numéros d'assurance sociale (NAS) pour ma famille",
  },
  health_card: {
    en: "apply for my Ontario health card (OHIP)",
    fr: "demander ma carte Santé de l'Ontario (OHIP)",
    enMany: "apply for Ontario health cards (OHIP) for my family",
    frMany: "demander des cartes Santé de l'Ontario (OHIP) pour ma famille",
  },
  bank_account: { en: "open a bank account", fr: "ouvrir un compte bancaire" },
  school_registration: {
    en: "register my child for school",
    fr: "inscrire mon enfant à l'école",
    enMany: "register my children for school",
    frMany: "inscrire mes enfants à l'école",
  },
  housing: {
    en: "get help finding a permanent place to live",
    fr: "obtenir de l'aide pour trouver un logement permanent",
  },
};

type Parts = {
  name: string | null;
  itemId: string;
  fallbackTask: string;
  count: number;
  language: string;
  others: string[];
};

function list(names: string[], and: string): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/** The card's sentences for the clerk, in English ("en") or French ("fr"). */
export function staffText(lang: "en" | "fr", p: Parts) {
  const task = TASKS[p.itemId];
  const phrase = task ? (p.count > 1 ? (lang === "en" ? task.enMany : task.frMany) ?? task[lang] : task[lang]) : null;
  const language = languageName(p.language, lang);
  const others = p.others.filter((o) => o !== p.language).map((o) => languageName(o, lang));
  if (lang === "en") {
    return {
      label: "For staff",
      hello: p.name ? `Hello, my name is ${p.name}.` : "Hello.",
      arrived: "I recently arrived in Canada as a refugee and I don't speak English or French well yet.",
      task: phrase ? `I am here to ${phrase}.` : `I am here for: ${p.fallbackTask}.`,
      speak: others.length ? `I speak ${language} (and also ${list(others, "and")}).` : `I speak ${language}.`,
      interpreter: `Could you please help me find an interpreter or someone who speaks ${language}? Thank you.`,
      documents: "Documents I have with me:",
      id: "My Arrive ID:",
    };
  }
  return {
    label: "Pour le personnel",
    hello: p.name ? `Bonjour, je m'appelle ${p.name}.` : "Bonjour.",
    arrived: "Je suis arrivé(e) récemment au Canada comme réfugié(e) et je ne parle pas encore bien l'anglais ni le français.",
    task: phrase ? `Je suis ici pour ${phrase}.` : `Je suis ici pour : ${p.fallbackTask}.`,
    speak: others.length ? `Je parle ${language} (et aussi ${list(others, "et")}).` : `Je parle ${language}.`,
    interpreter: `Pourriez-vous m'aider à trouver un interprète ou une personne qui parle ${language}? Merci.`,
    documents: "Documents que j'ai avec moi :",
    id: "Mon identifiant Arrive :",
  };
}

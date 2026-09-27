// Understand a spoken or typed onboarding answer on the phone, in the six app languages, with simple rules.
// No AI service is involved, so it is instant and never "busy". Every result is shown on screen, where the person
// can fix it before moving on.

import { countryName } from "@/config/languages";
import { ALL_COUNTRIES } from "@/config/countries";

// ---------- text helpers ----------

/** Lower case, Latin accents and Arabic vowel marks removed, Arabic letter variants unified, digits to ASCII. */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966))
    .replace(/[’`]/g, "'");
}

const words = (text: string): string[] => norm(text).match(/[\p{L}\p{M}\p{N}']+/gu) ?? [];
const hasHan = (text: string) => /\p{Script=Han}/u.test(text);
const clean = (text: string) => text.replace(/^[\s.,;:!?¿¡"'«»“”。，！？、؟،]+|[\s.,;:!?¿¡"'«»“”。，！？、؟،]+$/g, "").trim();

function titleCase(text: string): string {
  return text.replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

function hasAny(text: string, list: readonly string[]): boolean {
  const n = ` ${words(text).join(" ")} `;
  const raw = norm(text);
  return list.some((w) => (/\p{Script=Han}/u.test(w) ? raw.includes(w) : n.includes(` ${norm(w)} `)));
}

// ---------- numbers ----------

const NUMBERS: Record<string, number> = {};
const addNumbers = (list: string[], n: number) => list.forEach((w) => (NUMBERS[norm(w)] = n));
addNumbers(["zero", "no", "none", "zéro", "aucun", "aucune", "cero", "ninguno", "ninguna", "صفر", "शून्य"], 0);
addNumbers(["one", "a", "an", "un", "une", "uno", "una", "واحد", "واحدة", "एक"], 1);
addNumbers(["two", "deux", "dos", "اثنان", "اثنين", "اثنتان", "اثنتين", "दो"], 2);
addNumbers(["three", "trois", "tres", "ثلاثة", "ثلاث", "तीन"], 3);
addNumbers(["four", "quatre", "cuatro", "اربعة", "اربع", "चार"], 4);
addNumbers(["five", "cinq", "cinco", "خمسة", "خمس", "पांच", "पाँच"], 5);
addNumbers(["six", "seis", "ستة", "ست", "छह", "छः"], 6);
addNumbers(["seven", "sept", "siete", "سبعة", "سبع", "सात"], 7);
addNumbers(["eight", "huit", "ocho", "ثمانية", "ثماني", "आठ"], 8);
addNumbers(["nine", "neuf", "nueve", "تسعة", "تسع", "नौ"], 9);
addNumbers(["ten", "dix", "diez", "عشرة", "عشر", "दस"], 10);
const HAN_NUMBERS: Record<string, number> = { 零: 0, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

function numberWord(token: string): number | null {
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return token in NUMBERS ? NUMBERS[token] : null;
}

/** All numbers said in the text (digits or number words). */
export function numbersIn(text: string): number[] {
  const out = words(text).map(numberWord).filter((n): n is number => n !== null);
  for (const m of norm(text).matchAll(/[零一两二三四五六七八九十]+/g)) out.push(hanNumber(m[0]));
  return out;
}

function hanNumber(s: string): number {
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (HAN_NUMBERS[s[1]] ?? 0);
  if (s.includes("十")) return (HAN_NUMBERS[s[0]] ?? 1) * 10 + (HAN_NUMBERS[s[2]] ?? 0);
  return HAN_NUMBERS[s[0]] ?? 0;
}

// ---------- yes / no ----------

const YES = ["yes", "yeah", "yep", "yup", "sure", "correct", "right", "i am", "i do", "oui", "ouais", "si", "sí", "claro", "نعم", "ايوه", "ايوا", "اي", "اجل", "اكيد", "هاں", "हाँ", "हां", "जी", "हा", "是", "对", "有", "嗯", "是的"];
const NO = ["no", "nope", "not", "don't", "dont", "non", "pas", "لا", "كلا", "ليس", "नहीं", "नही", "ना", "不", "没有", "没", "否", "不是"];

export function yesNo(text: string): boolean | null {
  if (hasAny(text, NO)) return false;
  if (hasAny(text, YES)) return true;
  return null;
}

/** "Are you 65 or older?": yes/no, or an age that was said. */
export function isSenior(text: string): boolean | null {
  const ages = numbersIn(text).filter((n) => n >= 18 && n <= 115);
  if (ages.length) return Math.max(...ages) >= 65;
  return yesNo(text);
}

// ---------- name and city ----------

const NAME_PATTERNS = [
  /(?:my name is|my name's|name is|call me|i am|i'm|it's|it is)\s+(.+)/i,
  /(?:je m'appelle|je m appelle|mon nom est|mon nom c'est|appelez-moi|appelle-moi|je suis|c'est)\s+(.+)/i,
  /(?:me llamo|mi nombre es|llámame|llamame|soy)\s+(.+)/i,
  /(?:اسمي هو|اسمي|ناديني|نادني|أنا|انا)\s+(.+)/,
  /(?:मेरा नाम|मुझे)\s+(.+?)\s*(?:है|हैं|कहिए|कहो|बुलाइए|बुलाओ)?[।.]?$/,
  /मैं\s+(.+?)\s*(?:हूँ|हूं)/,
  /(?:我的名字是|我的名字叫|我叫|叫我|我是)\s*(.+)/,
];

/** The name the person wants to be called. */
export function extractName(text: string): string | null {
  let raw = clean(text);
  if (!raw) return null;
  for (const re of NAME_PATTERNS) {
    const m = re.exec(raw);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }
  raw = clean(raw.split(/[,.;!?。，！？،؟]| and | et | y | و /)[0]);
  if (hasHan(raw)) return raw.replace(/[^\p{Script=Han}]/gu, "").slice(0, 4) || null;
  const parts = raw.split(/\s+/).filter(Boolean).slice(0, 2);
  const name = parts.join(" ").slice(0, 40);
  return name ? titleCase(name) : null;
}

const OTTAWA = ["ottawa", "otawa", "otaua", "اوتاوا", "اتاوا", "ओटावा", "ऑटवा", "渥太华"];
const CITY_PATTERNS = [
  /(?:^|\s)(?:i live in|i'm in|i am in|living in|in)\s+(.+)/i,
  /(?:^|\s)(?:je vis à|je vis a|j'habite à|j'habite a|j'habite|à)\s+(.+)/i,
  /(?:^|\s)(?:vivo en|estoy en|en)\s+(.+)/i,
  /(?:^|\s)(?:اعيش في|أعيش في|اسكن في|أسكن في|في)\s+(.+)/,
  /(?:मैं)?\s*(.+?)\s*में\s*(?:रहता|रहती|रहते|हूँ|हूं|हैं)/,
  /(?:我住在|我在|住在)\s*(.+)/,
];

export function extractCity(text: string): string | null {
  if (hasAny(text, OTTAWA) || OTTAWA.some((o) => norm(text).includes(o))) return "Ottawa";
  let raw = clean(text);
  for (const re of CITY_PATTERNS) {
    const m = re.exec(raw);
    if (m?.[1]) {
      raw = m[1];
      break;
    }
  }
  raw = clean(raw.split(/[,.;!?。，！？،؟]/)[0]);
  if (!raw) return null;
  return hasHan(raw) ? raw.slice(0, 20) : titleCase(raw.split(/\s+/).slice(0, 3).join(" ")).slice(0, 80);
}

// ---------- country ----------

const COUNTRY_ALIASES: Record<string, string[]> = {
  SY: ["syria", "syrie", "siria", "سوريا", "سورية", "सीरिया", "叙利亚"],
  AF: ["afghanistan", "afganistán", "افغانستان", "अफ़ग़ानिस्तान", "अफगानिस्तान", "阿富汗"],
  IQ: ["iraq", "irak", "العراق", "عراق", "इराक", "伊拉克"],
  SD: ["sudan", "soudan", "السودان", "सूडान", "苏丹"],
  SS: ["south sudan", "جنوب السودان"],
  ER: ["eritrea", "érythrée", "ارتيريا", "اريتريا", "इरिट्रिया", "厄立特里亚"],
  ET: ["ethiopia", "éthiopie", "etiopía", "اثيوبيا", "इथियोपिया", "埃塞俄比亚"],
  SO: ["somalia", "somalie", "الصومال", "सोमालिया", "索马里"],
  YE: ["yemen", "yémen", "اليمن", "यमन", "也门"],
  CD: ["congo", "drc", "rdc", "الكونغو", "कांगो", "刚果"],
  UA: ["ukraine", "ucrania", "اوكرانيا", "यूक्रेन", "乌克兰"],
  PS: ["palestine", "palestina", "gaza", "فلسطين", "غزة", "फ़िलिस्तीन", "巴勒斯坦"],
  LB: ["lebanon", "liban", "líbano", "لبنان", "लेबनान", "黎巴嫩"],
  IR: ["iran", "irán", "ايران", "ईरान", "伊朗"],
  TR: ["turkey", "turkiye", "turquie", "turquía", "تركيا", "तुर्की", "土耳其"],
  MM: ["myanmar", "burma", "birmanie", "म्यांमार", "缅甸"],
  VE: ["venezuela", "فنزويلا", "वेनेज़ुएला", "委内瑞拉"],
  CO: ["colombia", "colombie", "كولومبيا", "कोलंबिया", "哥伦比亚"],
  HT: ["haiti", "haïti", "هايتي", "हैती", "海地"],
  IN: ["india", "inde", "الهند", "भारत", "印度"],
  CN: ["china", "chine", "الصين", "चीन", "中国"],
};

export type Country = { code: string | null; name: string };

/** A country from what was said: its ISO code when we recognise it, and a name to show either way. */
export function extractCountry(text: string, locale: string): Country | null {
  const raw = clean(text);
  if (!raw) return null;
  const hay = ` ${words(raw).join(" ")} `;
  const hayRaw = norm(raw);
  let best: { code: string; len: number } | null = null;
  const consider = (code: string, name: string) => {
    const n = norm(name);
    if (n.length < 2) return;
    const found = hasHan(n) ? hayRaw.includes(n) : hay.includes(` ${words(n).join(" ")} `);
    if (found && (!best || n.length > best.len)) best = { code, len: n.length };
  };
  for (const [code, names] of Object.entries(COUNTRY_ALIASES)) names.forEach((n) => consider(code, n));
  for (const code of ALL_COUNTRIES) {
    consider(code, countryName(code, locale));
    consider(code, countryName(code, "en"));
  }
  const match = best as { code: string; len: number } | null;
  if (match) return { code: match.code, name: countryName(match.code, locale) };
  const stripped = raw.replace(/^(?:i come from|i am from|i'm from|from|je viens de|je viens du|de|du|vengo de|soy de|انا من|أنا من|من|मैं|我来自|来自)\s+/i, "");
  return { code: null, name: clean(stripped.split(/[,.;!?。，]/)[0]).slice(0, 60) };
}

// ---------- gender ----------

export type GenderValue = "man" | "woman" | "another" | "prefer_not_to_say";

export function extractGender(text: string): GenderValue | null {
  if (
    hasAny(text, ["prefer not", "rather not", "don't want", "prefer not to say", "je préfère ne pas", "préfère pas", "prefiero no", "no quiero decir", "افضل عدم", "لا اريد", "नहीं बताना", "बताना नहीं", "不想说", "不愿意说", "保密"]) ||
    /prefer not|rather not|préf[eè]re (?:ne )?pas|prefiero no|افضل عدم|नहीं बता|不想说|保密/i.test(norm(text))
  )
    return "prefer_not_to_say";
  if (hasAny(text, ["other", "another", "non-binary", "nonbinary", "autre", "non binaire", "otro", "otra", "no binario", "اخر", "غير ذلك", "अन्य", "दूसरा", "其他", "别的"])) return "another";
  if (hasAny(text, ["woman", "female", "women", "lady", "femme", "féminin", "mujer", "femenino", "امراة", "مراة", "انثى", "سيدة", "بنت", "महिला", "औरत", "स्त्री", "女"])) return "woman";
  if (hasAny(text, ["man", "male", "men", "homme", "masculin", "hombre", "masculino", "varon", "رجل", "ذكر", "पुरुष", "आदमी", "मर्द", "男"])) return "man";
  return null;
}

// ---------- household ----------

export type HouseholdCount = { adults: number; seniors: number; children_0_5: number; children_6_17: number };
type Group = keyof HouseholdCount | "child";

const GROUP_WORDS: [Group, string[]][] = [
  ["seniors", ["senior", "seniors", "elderly", "grandmother", "grandfather", "grandma", "grandpa", "grandparent", "grandparents", "aine", "aines", "agee", "agees", "grand-mere", "grand-pere", "grands-parents", "anciano", "anciana", "ancianos", "mayores", "abuelo", "abuela", "abuelos", "مسن", "مسنة", "مسنين", "السن", "جدي", "جدتي", "جد", "جدة", "बुजुर्ग", "बूढ़े", "दादा", "दादी", "नाना", "नानी", "老人", "老年人", "爷爷", "奶奶", "外公", "外婆", "祖父", "祖母"]],
  ["children_0_5", ["baby", "babies", "toddler", "toddlers", "infant", "newborn", "bebe", "bebes", "nourrisson", "رضيع", "رضيعة", "طفل رضيع", "शिशु", "बेबी", "婴儿", "宝宝", "宝贝"]],
  ["child", ["child", "children", "kid", "kids", "son", "sons", "daughter", "daughters", "boy", "boys", "girl", "girls", "teen", "teenager", "enfant", "enfants", "fils", "fille", "filles", "garcon", "garcons", "nino", "ninos", "nina", "ninas", "hijo", "hijos", "hija", "hijas", "طفل", "اطفال", "طفلة", "طفلين", "طفلان", "ولد", "اولاد", "ولدين", "ابن", "ابني", "ابنة", "ابنتي", "ابنين", "بنت", "بنات", "بنتين", "बच्चा", "बच्चे", "बच्ची", "बच्चों", "बेटा", "बेटे", "बेटी", "बेटियां", "बेटियाँ", "孩子", "小孩", "儿童", "儿子", "女儿"]],
  ["adults", ["adult", "adults", "wife", "husband", "spouse", "partner", "brother", "brothers", "sister", "sisters", "mother", "father", "mom", "dad", "parents", "adulte", "adultes", "femme", "mari", "epouse", "epoux", "conjoint", "conjointe", "frere", "freres", "soeur", "soeurs", "mere", "pere", "adulto", "adultos", "esposa", "esposo", "marido", "mujer", "hermano", "hermanos", "hermana", "hermanas", "madre", "padre", "padres", "بالغ", "بالغين", "بالغان", "بالغون", "زوجتي", "زوجي", "زوجة", "زوج", "اخي", "اخ", "اخت", "اختي", "اخوتي", "امي", "ابي", "والدي", "والدتي", "वयस्क", "बड़े", "पत्नी", "पति", "भाई", "बहन", "माँ", "मां", "पिता", "妻子", "老婆", "丈夫", "老公", "太太", "先生", "哥哥", "弟弟", "姐姐", "妹妹", "兄弟", "姐妹", "父母", "爸爸", "妈妈", "大人", "成人", "成年人"]],
];
const DUALS = ["طفلين", "طفلان", "ولدين", "ابنين", "بنتين", "بالغان", "بالغين"];
const YEARS = ["year", "years", "yr", "ans", "an", "anos", "ano", "سنة", "سنوات", "سنين", "عمر", "साल", "वर्ष", "岁"];
const ALONE = ["alone", "just me", "only me", "by myself", "nobody", "no one", "seul", "seule", "personne", "solo", "sola", "nadie", "وحدي", "لوحدي", "بمفردي", "अकेला", "अकेली", "अकेले", "कोई नहीं", "一个人", "我自己", "独自", "没有人"];

const GENERIC = new Set(
  ["child", "children", "kid", "kids", "enfant", "enfants", "nino", "ninos", "طفل", "اطفال", "طفلين", "طفلان", "बच्चा", "बच्चे", "बच्चों", "孩子", "小孩", "儿童",
   "adult", "adults", "adulte", "adultes", "adulto", "adultos", "بالغ", "بالغين", "بالغان", "بالغون", "वयस्क", "大人", "成人", "成年人"].map(norm),
);

/** Arabic joins "and" (و) and "the" (ال) to the next word: try the word without them. */
function variants(token: string): string[] {
  const out = [token];
  for (const p of ["وال", "و", "ال"]) if (token.startsWith(p) && token.length > p.length + 1) out.push(token.slice(p.length));
  return out;
}

function groupOf(token: string): { group: Group; word: string } | null {
  for (const v of variants(token)) {
    for (const [group, list] of GROUP_WORDS) if (list.some((w) => norm(w) === v)) return { group, word: v };
  }
  return null;
}

function numberOf(token: string | undefined): number | null {
  if (!token) return null;
  for (const v of variants(token)) {
    const n = numberWord(v);
    if (n !== null) return n;
  }
  return null;
}

type Mention = { group: Group; n: number; age: number | null; numbered: boolean; generic: boolean };

function mentions(text: string): Mention[] {
  const found: Mention[] = [];
  if (hasHan(text)) {
    const s = norm(text);
    const used = new Array<boolean>(s.length).fill(false);
    const all = GROUP_WORDS.flatMap(([group, list]) => list.filter(hasHan).map((w) => ({ group, w })));
    all.sort((a, b) => b.w.length - a.w.length); // longest words first: 小孩子 is one mention
    for (const { group, w } of all) {
      for (let i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) {
        if (used.slice(i, i + w.length).some(Boolean)) continue;
        used.fill(true, i, i + w.length);
        const before = s.slice(Math.max(0, i - 4), i).replace(/[个位名]/g, "");
        const m = /(\d+|[零一两二三四五六七八九十]+)$/.exec(before);
        const a = /^[^，。,]{0,3}?(\d+|[一两二三四五六七八九十]+)岁/.exec(s.slice(i + w.length));
        const toNum = (x: string) => (/\d/.test(x) ? Number(x) : hanNumber(x));
        found.push({ group, n: m ? toNum(m[1]) : 1, age: a ? toNum(a[1]) : null, numbered: Boolean(m), generic: GENERIC.has(w) });
      }
    }
    return found;
  }
  const tokens = words(text);
  const arabic = /\p{Script=Arabic}/u.test(text);
  tokens.forEach((tok, i) => {
    let hit = groupOf(tok);
    // "كبار السن" = seniors (كبار alone means "big/adults").
    if (tok === "كبار" && tokens[i + 1] === "السن") hit = { group: "seniors", word: "السن" };
    if (tok === "السن" && tokens[i - 1] === "كبار") return;
    if (!hit) return;
    let n: number | null = null;
    // A number just before the word (stop at another family word, so "two adults and a child" stays apart).
    for (let j = i - 1; j >= Math.max(0, i - 3) && n === null; j--) {
      if (groupOf(tokens[j])) break;
      n = numberOf(tokens[j]);
    }
    if (n === null && arabic) n = numberOf(tokens[i + 1]); // Arabic: "اطفال ثلاثة"
    const dual = DUALS.includes(hit.word);
    let age: number | null = null;
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 5); j++) {
      if (groupOf(tokens[j])) break;
      if (YEARS.includes(tokens[j]) && numberOf(tokens[j - 1]) !== null) {
        age = numberOf(tokens[j - 1]);
        break;
      }
    }
    found.push({ group: hit.group, n: n ?? (dual ? 2 : 1), age, numbered: n !== null || dual, generic: GENERIC.has(hit.word) });
  });
  return found;
}

/** "I have two adults and one child" -> counts of the people who came WITH the person. Null if nothing was found. */
export function extractHousehold(text: string): HouseholdCount | null {
  const all = mentions(text);
  if (!all.length) return hasAny(text, ALONE) ? { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 } : null;
  const out: HouseholdCount = { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 };
  for (const group of ["adults", "seniors", "children_0_5", "child"] as const) {
    const list = all.filter((m) => m.group === group);
    // "two children, a son and a daughter": the counted words win over the examples that follow.
    const counted = list.filter((m) => m.generic && m.numbered);
    const specific = list.filter((m) => !m.generic);
    const use = counted.length ? counted : specific.length ? specific : list.slice(0, 1);
    for (const m of use) {
      if (group === "child") {
        if (m.age !== null && m.age <= 5) out.children_0_5 += m.n;
        else out.children_6_17 += m.n;
      } else out[group] += m.n;
    }
  }
  const cap = (x: number) => Math.max(0, Math.min(20, x));
  return { adults: cap(out.adults), seniors: cap(out.seniors), children_0_5: cap(out.children_0_5), children_6_17: cap(out.children_6_17) };
}

// ---------- end-of-session score ----------

export function extractScore(text: string): number | null {
  const n = numbersIn(text).find((x) => x >= 1 && x <= 5);
  if (n) return n;
  if (hasAny(text, ["not at all", "pas du tout", "para nada", "nada", "ابدا", "بالكل", "बिल्कुल नहीं", "一点也不", "没有帮助"])) return 1;
  if (hasAny(text, ["very much", "a lot", "so much", "excellent", "great", "beaucoup", "enormement", "mucho", "muchisimo", "كثيرا", "جدا", "ممتاز", "बहुत", "非常", "很有帮助", "太好了"])) return 5;
  if (hasAny(text, ["a little", "un peu", "un poco", "قليلا", "شوي", "थोड़ा", "थोड़ी", "一点", "有点"])) return 2;
  if (hasAny(text, ["some", "okay", "ok", "so so", "moyen", "más o menos", "regular", "مقبول", "ठीक", "一般", "还行"])) return 3;
  if (hasAny(text, ["good", "yes", "helped", "bien", "oui", "si", "bueno", "جيد", "نعم", "अच्छा", "हाँ", "好", "有帮助"])) return 4;
  if (hasAny(text, ["no", "non", "bad", "mal", "لا", "سيء", "नहीं", "不好", "没有"])) return 1;
  return null;
}

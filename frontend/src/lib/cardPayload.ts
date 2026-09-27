// Staff card data in the URL fragment (docs/REDESIGN.md 7.2). Browsers never send the part after "#" to a server,
// so a clerk who scans the QR code opens the card without any personal data reaching Arrive's backend or logs.
// Format: "1." + base64url(deflate-raw(JSON)), or "0." + base64url(JSON) where CompressionStream is missing.

export type CardData = {
  v: 1;
  /** First name, if the person gave one. */
  n: string | null;
  /** The person's language (app locale). */
  l: string;
  /** Other languages they speak. */
  o: string[];
  /** Checklist item id (the staff-facing task phrase is looked up from it). */
  i: string;
  /** The task in the person's language (the item title). */
  t: string;
  /** Documents they have with them, in English and in their language. */
  de: string[];
  dx: string[];
  /** Arrive profile ID. */
  id: string;
  /** Created and expiry times, in seconds. */
  c: number;
  e: number;
  /** How many people the task is for (e.g. 2 children to register for school). */
  k: number;
};

export const CARD_LIFETIME_DAYS = 90;
const MAX_TEXT = 200;
const MAX_ITEMS = 12;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeCard(data: CardData): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "undefined") return `0.${toBase64Url(json)}`;
  return `1.${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
}

const text = (v: unknown, max = MAX_TEXT): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, MAX_ITEMS).map((x) => x.slice(0, MAX_TEXT)) : [];

/** Read a card from a fragment. Anything malformed returns null; every field is checked, since anyone can make a URL. */
export async function decodeCard(fragment: string): Promise<CardData | null> {
  try {
    const raw = fragment.replace(/^#/, "");
    const [version, body] = [raw.slice(0, 2), raw.slice(2)];
    if (!body || body.length > 8000) return null;
    let bytes = fromBase64Url(body);
    if (version === "1.") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } else if (version !== "0.") {
      return null;
    }
    const d = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (d.v !== 1) return null;
    const lang = text(d.l, 8);
    const item = text(d.i, 60);
    const id = text(d.id, 40);
    if (!lang || !/^[a-z]{2,3}$/.test(lang) || !item || !/^[a-z0-9_]+$/.test(item) || !id) return null;
    return {
      v: 1,
      n: text(d.n, 40),
      l: lang,
      o: list(d.o).filter((x) => /^[a-z]{2,3}$/.test(x)),
      i: item,
      t: text(d.t) ?? "",
      de: list(d.de),
      dx: list(d.dx),
      id,
      c: typeof d.c === "number" ? d.c : 0,
      e: typeof d.e === "number" ? d.e : 0,
      k: typeof d.k === "number" ? Math.max(1, Math.min(20, Math.round(d.k))) : 1,
    };
  } catch {
    return null;
  }
}

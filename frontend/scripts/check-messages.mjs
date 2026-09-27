// Every messages/<locale>.json must have exactly the keys of en.json, with the same {placeholders}, and every
// locale other than English must carry "_review" until a native speaker has checked it.
// Run: npm run check:messages (also part of npm run lint).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "messages");

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    if (k === "_review") continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out.set(key, String(v));
  }
  return out;
}

// ICU argument names: {name}, {count, plural, ...}. Text inside plural branches ("one {# child}") is not a name.
const args = (text) => new Set([...text.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]));
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const read = (file) => JSON.parse(readFileSync(join(dir, file), "utf8"));
const en = flatten(read("en.json"));
const problems = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const raw = read(file);
  const messages = flatten(raw);
  if (!raw._review) problems.push(`${file}: missing "_review" marker`);
  for (const key of en.keys()) if (!messages.has(key)) problems.push(`${file}: missing ${key}`);
  for (const key of messages.keys()) if (!en.has(key)) problems.push(`${file}: extra ${key}`);
  for (const [key, text] of messages) {
    if (en.has(key) && !same(args(en.get(key)), args(text))) {
      problems.push(`${file}: ${key} placeholders {${[...args(text)].join(", ")}} differ from English`);
    }
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in messages/`);
  process.exit(1);
}
console.log(`messages: ${en.size} keys, all locales match`);

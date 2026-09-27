# Arrive redesign: voice-first onboarding, household checklist, programs, staff cards

This document changes the product direction of Arrive. It **overrides** `docs/SPEC.md` wherever they conflict.
Everything in `CLAUDE.md` still applies (official sources only, never invent government facts, privacy,
accessibility, no secrets in the repo, check current docs).

Work on a new branch `redesign` created from `main`. Build in the phases in section 12. Stop after each phase,
report, and wait for approval.

---

## 1. Why this change

**Target user:** Government-Assisted Refugees (GARs) arriving in **Ottawa** as **permanent residents**, often with
family members (adults, seniors, children), often speaking no English or French, often with low literacy.

GARs are supported by the federal Resettlement Assistance Program (RAP) through a local service provider for
roughly their first year. They must complete a set of essential registrations quickly (SIN, health card, bank
account, school, benefits...), and the list grows with each family member. Arrive turns this into a personal,
spoken, household-aware checklist in their language, and gives them tools to get through in-person visits.

The design generalizes later to other permanent residents (economic, family class), but the MVP is GARs in Ottawa.

**People to government:** anonymized usage (which checklist items stall, which programs interest which language
groups, survey feedback) is reported to institutions through the existing needs dashboard.

---

## 2. What stays, what changes, what goes

| Area | Decision |
|---|---|
| Backend stack, Tiger Data, Auth0 (staff only), deployment | **Stays** |
| Grounded answers from official sources (`/api/ask`, RAG, citations) | **Stays**, now used by the avatar assistant |
| ElevenLabs web agent | **Stays**, becomes the "Ask the avatar" assistant |
| Read-aloud TTS | **Stays**, also used to speak onboarding questions |
| Handoff to settlement worker, worker inbox | **Stays** (reachable from the assistant and from "Get help") |
| Needs dashboard | **Stays and extends** with new analytics (section 9) |
| Old 6-question onboarding form | **Replaced** by voice onboarding (section 4) |
| Roadmap for `refugee_pr` / `international_student` | **Replaced** by the household checklist (section 5). Keep the international student templates in the repo but not in the UI |
| Letters decoder, scam check | **Kept but hidden** from main navigation; reachable from a "More help" menu |
| Bottom navigation (Roadmap, Ask, Letters, Is it real?) | **Replaced** by the new home screen layout (section 6) |

Do not delete working code that is being hidden; remove it from navigation only.

---

## 3. Languages

Initial languages, chosen for recent GAR populations. Confirm against current resettlement data `[VERIFY]`:

| Code | Language | Direction |
|---|---|---|
| `en` | English | LTR |
| `fr` | French | LTR |
| `ar` | Arabic | RTL |
| `prs` | Dari | RTL |
| `ps` | Pashto | RTL |
| `ti` | Tigrinya | LTR |

- The language list is data-driven (`frontend/src/config/languages.ts`) so languages can be added.
- **Check current ElevenLabs speech-to-text and text-to-speech support, and Gemini support, for each language.**
  Store capabilities per language (`tts: bool`, `stt: bool`). If a language lacks speech support, the app still
  works in that language in text mode: questions are shown as large text with icons, answers are tapped or typed,
  and a clear message explains that voice is not available yet for that language.
- UI strings for every language are drafts marked `"_review": "needs native speaker review"`.

---

## 4. Voice onboarding with the avatar

### 4.1 Flow
1. **Language screen:** large buttons with each language's name in its own script. Nothing else.
2. **Avatar introduction:** the avatar greets the person in the chosen language, explains in one or two sentences
   that it will ask a few questions to build their checklist, that nothing is shared with immigration officials,
   and that they can answer by speaking or tapping.
3. **Questions, one per screen,** spoken by the avatar and shown as text:

| Key | Question (meaning) | Answer type | Required | Used for |
|---|---|---|---|---|
| `first_name` | What should I call you? | short text | optional | greeting, ID card, staff card |
| `city` | Which city are you living in now? | choice: Ottawa / other (name) | yes | location-specific items and programs |
| `country_of_origin` | Which country are you coming from? | country (ISO code) | optional | anonymized analytics only |
| `gender` | How do you describe your gender? | choice incl. "prefer not to say" | optional | analytics only (does not change the checklist) |
| `household` | Who arrived with you? | counts: adults 18 to 64, seniors 65+, children 0 to 5, children 6 to 17 (the person themself counts as one adult or senior) | yes | checklist and programs |
| `disability` | Does anyone in your family have a disability or long-term health condition? | per group: none / adult / senior / child, or "prefer not to say" | optional | disability items and programs |
| `languages_spoken` | Which other languages do you speak? | multi-choice | optional | staff card interpreter request |

4. **Summary screen:** everything collected, each item editable by tapping, then "Create my checklist".
5. **Profile created:** a random, human-readable ID is shown (for example `ARV-7K3P-9QXM`), with a note that it is
   saved on this phone and can be used to reopen the profile on another device.

### 4.2 How each answer is captured
For every question:
1. Frontend plays the question audio (`POST /api/tts`, cached) while the avatar is in the "speaking" state.
2. The person taps the large mic button (or it auto-starts after the question if the person enabled
   auto-listen) and speaks. Avatar state: "listening". Show a live level meter.
3. Audio is sent to `POST /api/onboarding/answer` with `question_key` and `language`.
4. Backend transcribes with **ElevenLabs speech-to-text** (check current API and model names in the docs),
   then Gemini extracts a structured value using a response schema for that `question_key`, and writes a short
   confirmation sentence in the person's language (for example "You arrived with 2 children and 1 grandparent.
   Is that right?").
5. Frontend speaks and shows the confirmation with three big buttons: **Yes**, **No, try again**, **Type or tap
   instead**.
6. **Every question also has a tap or type alternative on screen at all times** (choice cards with icons,
   number steppers for household counts, a text field for names). Voice is never the only way.
7. "Skip" is available on optional questions. "Repeat question" replays the audio.

Audio is processed in memory and never stored. Transcripts are not stored; only the extracted values are.

### 4.3 The avatar
- A friendly, culturally neutral **illustrated character** (animated SVG), not photorealistic.
- States: idle, speaking, listening, thinking. Mouth movement while speaking is driven by the audio amplitude
  (Web Audio API analyser). Respect `prefers-reduced-motion` (static face with a subtle state indicator).
- State is also shown as text and icon for accessibility ("Speaking...", "Listening...").
- "Powered by Gemini" refers to the understanding and answers; voice is ElevenLabs.

---

## 5. Household checklist

### 5.1 Rules engine
- Data lives in `backend/app/data/checklist_items.json` and `backend/app/data/locations.json`.
- Each item has: `id`, `title` (en), `summary` (en), `phase`, `priority`, `applies_to` rules, `per_person`
  (whether it repeats for each eligible family member), `in_person` (bool), `location_id`, `documents` (list),
  `steps` (list), `source_url` (must be a URL from `sources.yaml` or added there), `reviewed` (bool), `verify_notes`.
- `applies_to` uses household facts: `has_children_0_5`, `has_children_6_17`, `has_seniors`, `has_adults`,
  `disability_adult`, `disability_senior`, `disability_child`, `city`.
- Per-person items expand into one checklist row per eligible person, labelled "You", "Adult 2", "Child 1"...
  (or the first name if given for the main user only).
- Phases replace the old timing: **First 3 days**, **First 2 weeks**, **First month**, **First 3 months**,
  **First year**. Within a phase, sort by `priority`.
- If `city` is not Ottawa: show federal and Ontario items, hide Ottawa-specific locations, and show
  "Local offices for your city are not available yet" on detail pages. If the province is not Ontario, show only
  federal items and a clear note.
- Translations of titles, summaries, steps and documents are generated by Gemini and cached per language, as the
  current roadmap does. Gemini must not add, remove or change requirements.

### 5.2 Draft checklist content

**Everything below is a draft for the team to verify against official sources before the demo.** Every row
starts with `reviewed: false`. Do not invent addresses, phone numbers, hours, fees or eligibility thresholds:
use `[VERIFY: ...]` placeholders and list them in `docs/VERIFY.md`.

| id | Item | Applies to | Phase | In person | Where (institution) |
|---|---|---|---|---|---|
| `rap_orientation` | Meet your resettlement worker and complete RAP orientation | household | First 3 days | yes | RAP service provider in Ottawa `[VERIFY: provider name and address]` |
| `phone_number` | Get a Canadian phone number | household | First 3 days | yes | any provider (practical step, no government office) |
| `sin` | Apply for a Social Insurance Number | each adult and senior (children optional, see `sin_child`) | First 2 weeks | yes | Service Canada |
| `health_card` | Apply for an Ontario health card (OHIP) | every family member | First 2 weeks | yes | ServiceOntario |
| `ifhp` | Understand your temporary health coverage (Interim Federal Health Program) | household | First 3 days | no | IRCC `[VERIFY: coverage rules for resettled refugees]` |
| `bank_account` | Open a bank account | main user (plus other adults if wanted) | First 2 weeks | yes | any bank |
| `housing` | Find permanent housing with your resettlement worker | household | First month | yes | RAP service provider |
| `address_ircc` | Give IRCC your Canadian address so your PR card can be mailed | household | First month | no | IRCC `[VERIFY]` |
| `school_registration` | Register children for school | each child 6 to 17 (and 4 to 5 for kindergarten `[VERIFY]`) | First 2 weeks | yes | school board newcomer or reception centre `[VERIFY: OCDSB, OCSB, French boards]` |
| `immunization_records` | Bring or update children's vaccination records | each child | First month | yes | Ottawa Public Health `[VERIFY]` |
| `ccb` | Apply for the Canada Child Benefit | household with children | First month | no | Canada Revenue Agency (forms RC66 and RC66SCH `[VERIFY]`) |
| `settlement_services` | Register with a settlement agency | household | First month | yes | government-funded settlement agency |
| `language_assessment` | Book a language assessment for free English or French classes (LINC / CLIC) | each adult and senior | First month | yes | language assessment centre `[VERIFY: Ottawa assessment centre]` |
| `family_doctor` | Register to find a family doctor or newcomer health clinic | household | First month | no / yes | Health Care Connect (Ontario) `[VERIFY]`, newcomer health clinic `[VERIFY]` |
| `library_card` | Get a free library card | household | First month | yes | Ottawa Public Library |
| `transit` | Get a transit card and check discounted passes | each adult, senior | First 2 weeks | yes | OC Transpo, Presto, EquiPass `[VERIFY: eligibility]` |
| `photo_id` | Get an Ontario Photo Card (government ID) | each adult and senior | First 3 months | yes | ServiceOntario `[VERIFY: age rule]` |
| `immigration_loan` | Understand your immigration loan and when repayment starts | household | First 3 months | no | IRCC `[VERIFY]` |
| `drivers_licence` | Exchange or apply for an Ontario driver's licence | adults who drive | First 3 months | yes | DriveTest / ServiceOntario `[VERIFY: foreign licence rules]` |
| `sin_child` | Apply for children's SINs (needed for education savings) | each child | First 3 months | yes | Service Canada |
| `tax_return` | File your first tax return (even with no income) to receive benefits | each adult and senior | First year (by the deadline) | no / yes | CRA, free tax clinics (CVITP) |
| `dental_cdcp` | Check the Canada Dental Care Plan | household | First year (after tax filing) | no | Government of Canada `[VERIFY: eligibility]` |
| `senior_drug_benefit` | Understand prescription coverage for seniors (Ontario Drug Benefit) | each senior | First month | no | Ontario `[VERIFY]` |
| `senior_dental` | Check the Ontario Seniors Dental Care Program | each senior | First 3 months | no | Ontario / Ottawa Public Health `[VERIFY: eligibility]` |
| `dtc` | Apply for the Disability Tax Credit (with a medical practitioner) | each person with a disability | First year | no | CRA `[VERIFY]` |

The team said "7 mandatory items". Mark items with `essential: true` for: `sin`, `health_card`, `bank_account`,
`housing`, `school_registration` (if children), `ccb` (if children), `tax_return`, and confirm this set with the
team `[VERIFY]`. Essential items get a badge and sort first within their phase.

### 5.3 Checklist on the home screen
- Takes about half the screen height, grouped by phase with the current phase expanded.
- Each row: a large checkbox on the start side (left in LTR, right in RTL) to mark done, the title, who it is
  for ("You", "Child 1"), an "essential" badge where relevant, and a chevron.
- Progress summary at the top ("5 of 18 done").
- Completion is saved to the backend (`checklist_progress`) and locally for offline use.

---

## 6. Home screen layout (mobile first)

```
┌──────────────────────────────────┐
│ [ID]   Arrive            [Lang ▼]│  header: ID button (start corner), language switcher
│ Hello, Amira · 5 of 18 done      │
├──────────────────────────────────┤
│ YOUR CHECKLIST            (≈50%) │  phases, rows with checkboxes
│ ...                              │
├──────────────────────────────────┤
│ PROGRAMS FOR YOUR FAMILY         │  horizontally scrollable cards or list
│ ...                              │
├──────────────────────────────────┤
│ [More help]        [End session] │
└──────────────────────────────────┘
          (●) Ask the avatar          floating action button
```

- Floating "Ask the avatar" button opens the assistant (section 8).
- "More help" menu: Talk to a person (handoff), Scan a letter, Is this real? (scam check), Accessibility settings,
  How Arrive works (trust page).
- Accessibility settings remain (text size, high contrast, simple mode, auto read-aloud, reduce motion).

---

## 7. Detail pages and the staff card

### 7.1 Checklist item detail
In this order:
1. Title, who it is for, phase, essential badge, "Mark as done" button, "Listen" button.
2. **Photo of the location** if `in_person`, with alt text. Photos come only from files the team adds to
   `frontend/public/locations/` (their own photos or images they have rights to). Until then, show a neutral
   illustration placeholder. **Never scrape or hotlink photos.**
3. **Map** beside or below the photo:
   - A button "Open in Google Maps" using a plain Google Maps search URL built from the address (no API key needed).
   - An embedded map: OpenStreetMap embed by default (no key). If `GOOGLE_MAPS_EMBED_KEY` is set, use the Google
     Maps Embed API instead. The key is optional and documented in `.env.example`.
4. Address (copy button), phone number as a `tel:` link, hours, all from `locations.json` with `[VERIFY]` until filled.
5. **Documents to bring**, as a checklist with icons.
6. **Steps**, numbered, short.
7. **Staff card** button (only for items where `in_person` is true and the item is essential), which opens 7.2.
8. Source link with "last checked" date, and "information, not advice" note.

### 7.2 Staff card and QR code (privacy by design)
- A full-screen card the person can show directly, with a QR code the clerk can scan to open the same card on
  their own device.
- Content, in **English and French** at the top (large) and the person's language below:
  "Hello, my name is {first_name}. I recently arrived in Canada as a refugee and I don't speak English or French
  well yet. I am here to {task, for example: apply for my health card}. I speak {language} ({other languages}).
  Could you please help me find an interpreter or someone who speaks {language}? Thank you."
  Plus: the documents they have with them (from the item's document list) and the Arrive profile ID.
- **Privacy:** the QR encodes a URL to `/card` with all card data in the **URL fragment** (after `#`), compressed
  and base64url-encoded. The fragment is never sent to the server, so no personal data is stored or logged by
  scanning. The `/card` page renders only from the fragment. Add a "This card contains only what you see here"
  note. Include a small expiry timestamp in the payload and show "This card was created on {date}".
- Large text toggle, and a "Show to staff" landscape mode.

### 7.3 Programs
- `backend/app/data/programs.json`, same structure as checklist items but no staff card and no checkbox.
- Filtered by the profile: children programs only if children, senior programs only if seniors, disability
  programs only if the matching disability flag is set. General programs for everyone.
- Detail page: photo, map, address, phone, eligibility summary, how to apply, source link. "I'm interested" button
  (logs interest for analytics, see section 9).

**Draft program list (all `[VERIFY]` for current names, eligibility, and Ottawa locations):**

| Group | Program | Level |
|---|---|---|
| Everyone | Free English or French classes (LINC / CLIC) | Federal (IRCC-funded) |
| Everyone | Settlement agencies (for example OCISO, Catholic Centre for Immigrants, LASI World Skills, YMCA-YWCA newcomer services, Immigrant Women Services Ottawa) | IRCC-funded |
| Everyone | Employment Ontario services | Ontario |
| Everyone | Ottawa Public Library newcomer services | City |
| Everyone | Recreation fee assistance | City of Ottawa |
| Everyone | EquiPass (discounted transit) | City of Ottawa |
| Everyone | Social housing registry | City of Ottawa |
| Everyone | GST/HST credit and Ontario Trillium Benefit (through tax filing) | Federal / Ontario |
| Everyone | Ontario Electricity Support Program | Ontario |
| Everyone | Canada Dental Care Plan | Federal |
| Children | Canada Child Benefit and Ontario Child Benefit | Federal / Ontario |
| Children | Healthy Smiles Ontario (children's dental) | Ontario |
| Children | EarlyON Child and Family Centres | Ontario |
| Children | Child care fee subsidy | City of Ottawa |
| Children | Canada Learning Bond (education savings) | Federal |
| Seniors | Ontario Drug Benefit | Ontario |
| Seniors | Ontario Seniors Dental Care Program | Ontario |
| Seniors | Old Age Security and Guaranteed Income Supplement (explain residence requirements; many newcomers are not yet eligible) | Federal |
| Disability | Disability Tax Credit | Federal |
| Disability | Canada Disability Benefit (working-age adults) | Federal |
| Disability | Child Disability Benefit | Federal |
| Disability | Ontario Disability Support Program (explain how it relates to RAP income support) | Ontario |
| Disability | Assistive Devices Program | Ontario |
| Disability | Para Transpo (accessible transit) | City of Ottawa |
| Disability, children | Special Services at Home, Assistance for Children with Severe Disabilities | Ontario |

---

## 8. Ask the avatar (assistant)

- Opens a full-screen view with the same avatar and the ElevenLabs web agent.
- The agent uses the existing grounded tools (answers from official sources with citations) plus new tools:
  - `get_checklist(profile_id)`: returns the person's checklist status so it can answer "what should I do next?"
  - `get_item_details(item_id, language)`: address, documents, steps for an item.
  - `mark_item_done(profile_id, item_id)`: only after the person clearly confirms.
  - existing handoff tool.
- Update `docs/ELEVENLABS_AGENT.md` with the new system prompt, first message, languages and tool definitions.
- Text chat fallback in the same view for languages without speech support.

---

## 9. Data model changes (Tiger Data)

New migrations (do not edit applied ones):

| Table | Kind | Main columns |
|---|---|---|
| `profiles` (extend or replace) | regular | `id` (random readable ID, unique), `first_name_enc` (encrypted, nullable), `language`, `city`, `province`, `country_of_origin` (nullable), `gender` (nullable), `adults`, `seniors`, `children_0_5`, `children_6_17`, `disability_adult`, `disability_senior`, `disability_child` (nullable booleans), `other_languages` (text[]), `analytics_consent` (bool), `created_at`, `last_seen_at` |
| `checklist_progress` | regular | `profile_id`, `item_id`, `person_label`, `status`, `completed_at` |
| `session_events` | **hypertable** | `time`, `session_id` (random per session), `profile_ref` (salted hash of profile id), `event` (`view_item`, `view_program`, `program_interest`, `item_done`, `assistant_question`, `staff_card_opened`, `language_changed`), `target_id`, `language`, `country_of_origin` (only if consent), `household_type` (coarse), `city`, `is_sample` |
| `survey_responses` | regular | `time`, `session_id`, `profile_ref`, `satisfaction` (1 to 5), `missing_features` (text, PII-scrubbed), `language` |

Continuous aggregates: program interest by week, language and (if consented) country of origin; checklist item
completion and time-to-complete by phase; drop-off points (items viewed but not done after N days); survey
satisfaction by week and language.

**Privacy rules for analytics:**
- Ask for analytics consent on the summary screen in plain language (default off). Without consent, log events
  without `country_of_origin` and `gender`.
- Dashboards group by language and country of origin, **never** by name or profile. Keep suppression of groups
  smaller than 5.
- Use "country of origin" and "language", not "ethnicity".
- `first_name` is encrypted at rest (reuse the handoff encryption key approach) and never appears in analytics.
- Add a "Delete my profile" action that deletes the profile, its progress, and unlinks events.

**Needs dashboard additions:** program interest by language group, checklist bottlenecks, time to complete
essential items, survey satisfaction trend, top missing-feature themes (Gemini clustering over scrubbed text).

---

## 10. End session and survey
- "End session" opens: "Did Arrive help you today?" with five large faces (and voice answer option), then
  "Is anything missing, or is there something you would like Arrive to do?" (voice or text, optional).
- Voice answers are transcribed, scrubbed of personal details, then stored as text. Audio is never stored.
- After the survey: "Your checklist is saved on this phone. Your ID is {id}." and a button to go back.

---

## 11. The ID button
- Opens a card: first name (if given), profile ID, language and other languages, household summary
  ("family of 4"), with a QR code containing only the profile ID for quick reopening on another device.
- Text: "You can show this card when you introduce yourself."

---

## 12. Phases

**R1: Data and rules engine**
Migrations, checklist/programs/locations data files with drafts and `[VERIFY]` markers, household rules engine,
per-person expansion, phase sorting, translation cache, endpoints: `GET /api/checklist/{profile_id}`,
`PATCH /api/checklist/{profile_id}/items`, `GET /api/programs/{profile_id}`, `GET /api/items/{id}`.
✅ Tests: a single adult, a family with two children, a family with a senior and a child with a disability each
produce the correct items, phases and per-person rows.

**R2: Voice onboarding and avatar**
Languages config with speech capabilities, language screen, avatar component, question screens with voice and
tap alternatives, `POST /api/onboarding/answer` (speech-to-text + Gemini extraction + confirmation text),
summary screen with consent, readable profile ID.
✅ Full onboarding works by voice in Arabic and by tapping only; a language without speech support works in text mode.

**R3: Home screen, detail pages, staff card**
Home layout, checklist with checkboxes, item detail with photo placeholder, maps (OSM default, optional Google
embed), documents, steps, staff card with fragment-only QR and `/card` page.
✅ Keyboard-only and screen reader pass in English and Arabic; scanning the QR opens the card on another phone with
no request containing personal data reaching the backend (verify in backend logs).

**R4: Programs, ID card, end session, analytics**
Programs list and filters, program detail, interest logging, ID card, end session survey, session events,
consent handling, delete profile.
✅ Programs change correctly with the profile; events appear in `session_events`; no names or free text PII in events.

**R5: Assistant and dashboard**
New agent tools, updated `docs/ELEVENLABS_AGENT.md`, dashboard additions, sample data seeding for the new events.
✅ The avatar answers "what should I do next?" from the real checklist; dashboard shows program interest by language
with suppression.

**R6: Polish and deployment notes**
Hide old navigation items, empty and error states in all languages, performance on slow connections, README
updates (new env variables, new migration and seeding commands, ElevenLabs agent changes).
✅ Full Amira flow on a phone-sized screen in Arabic from language choice to staff card, and the smoke test passes.

At the end of every phase, report: what was built, how to test it, new `[VERIFY]` items, manual steps for the team,
known issues, and the next step.

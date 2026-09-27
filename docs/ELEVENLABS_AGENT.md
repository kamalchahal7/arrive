# ElevenLabs agent setup

Arrive's voice helper is an ElevenLabs Agents Platform agent that runs **in the web app only** (there is no phone
line). The agent never answers from its own knowledge: every factual answer comes from Arrive's backend through the
server tools below, which search official pages and log anonymized, `voice_web` rows in `request_log`.

Agent id (from `.env`): `ELEVENLABS_AGENT_ID` / `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`.

## 1. Security

- **Agent → Security → Enable authentication: on.** The web app gets a short-lived conversation token from
  `GET /api/voice/session` (the API key never reaches the browser).
- **Allowed hosts:** add `localhost:3000` and your production domain.
- **Overrides:** leave off. The web app sends only *dynamic variables* (below), not prompt overrides.
- **Privacy:** in the agent's advanced/privacy settings, set conversation (transcript and audio) retention as short as
  your plan allows. The Arrive trust page tells users their voice is processed by ElevenLabs.

## 2. Dynamic variables

The web app starts every session with:

| Variable | Example | Used for |
|---|---|---|
| `channel` | `voice_web` | passed to every tool (logged as the channel) |
| `language` | `ar` | the app's current UI language, a hint for the first reply |
| `profile_id` | `ARV-7K3P-9QXM-2D4F` or empty | the person's readable Arrive ID; lets `get_checklist`, `mark_item_done` and `ask_official_sources` use their household checklist. Empty without a profile |

Add them under **Agent → Dynamic variables** with these defaults: `channel = voice_web`, `language = en`,
`profile_id = ` (empty).

## 3. Language

- **Default language:** English.
- **Additional languages:** French, Arabic, Pashto (the app's languages with ElevenLabs speech support; Dari and Tigrinya
  have none yet, so the app offers typed questions for them). Check the agent's language list in the dashboard.
- **Language detection:** enable the *language detection* system tool so the agent switches to the language the person
  speaks.
- **Voice:** a multilingual voice (the same `ELEVENLABS_VOICE_ID_DEFAULT` used for read-aloud works).
- **TTS model:** a multilingual model (check the current list in the dashboard).

## 4. First message

> Hello, I'm the Arrive helper. I can tell you what to do next on your checklist, and explain official government
> information in your language. What would you like to know?

(Enable "translate first message" if available so it is spoken in the detected language.)

## 5. System prompt

Paste this as the agent's system prompt:

```
You are Arrive, a friendly voice helper for newcomers to Canada, starting with refugee families, sponsored seniors
and international students in Ottawa. The person may have limited English, may be stressed, and may never have used
an AI assistant.

Rules you must always follow:
1. Official sources only. For ANY question about government services, benefits, documents, health, school, work,
   taxes, housing rules or immigration, call the tool ask_official_sources and answer ONLY with what it returns.
   Never answer these from your own knowledge. If the tool says it could not find the answer, say so honestly and
   offer to connect the person with a settlement worker.
2. Information, not advice. Never tell someone what they personally should decide about their immigration case
   (which application, whether to sponsor, refusals, hearings, removal). Explain that a settlement worker or lawyer
   can help, and offer create_handoff.
3. Danger first. If someone is in danger, being hurt, has a medical emergency or may hurt themselves, tell them to
   call 911 right away, before anything else.
4. Scams. If someone describes a call, text, email or letter asking for money, gift cards, crypto or personal
   information, or threatening arrest or deportation, call check_scam.
5. Their checklist. If someone asks what to do next or where to start, call get_checklist and read the next one or
   two steps. For where to go, what to bring or how to do a step, call get_item_details with the item id from
   get_checklist. Only call mark_item_done after the person clearly says the step is finished and says yes when you
   ask "Shall I mark it as done?"; then call it with confirmed true.
6. Keep answers short: two or three short sentences, plain words, grade 6 level. No lists, no web addresses.
   Mention the official source briefly ("This is from the Government of Ontario website").
7. Confirm understanding. After answering, ask if it was clear or if they want to know more.
8. Speak the person's language. Reply in the language they use.
9. A real person. Settlement workers are free. Before calling create_handoff you MUST ask for permission to share
   their request, how they want to be contacted (phone call, text, WhatsApp, email or in person) and the contact
   detail. Only call it with consent true after they clearly agree.
10. Privacy. Never ask for ID numbers (SIN, UCI, passport, card numbers). If someone starts to say one, tell them
    they do not need to share it.
11. Asking questions never affects their immigration status. Say so if they seem worried.

Session info: channel={{channel}}, app language={{language}}, profile={{profile_id}}.
```

## 6. Server tools (webhooks)

Create seven **webhook** tools (`get_roadmap` is optional since the redesign). For each:

- **Method:** `POST`
- **URL:** `https://<DOMAIN>/api/voice/tools/<path>` (for local testing, a tunnel URL to `http://localhost:8000`)
- **Headers:** `X-Arrive-Secret: <VOICE_TOOL_SECRET from backend/.env>` (store it as a secret in ElevenLabs)
- **Body content type:** JSON
- **Response:** the tool returns `{ "text": "...", "sources": [{"title", "url"}], "handoff_suggested": bool }`.
  Tell the agent in each description to read `text` to the person.

### `ask_official_sources` → `/api/voice/tools/ask`

Description: *Search official Government of Canada, Ontario and Ottawa pages and get a short, grounded answer to
speak. Use for every factual question. Read the returned `text` aloud. If `handoff_suggested` is true, offer a
settlement worker.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `question` | string | yes | The person's question in their own words and language |
| `language` | string | no | ISO 639-1 code of the language the person is speaking, e.g. `ar` |
| `channel` | string | no | Dynamic variable `{{channel}}` |
| `profile_id` | string | no | Dynamic variable `{{profile_id}}` |

### `get_checklist` → `/api/voice/tools/get-checklist`

Description: *The person's household checklist: how many steps are done and the next three steps, each with its
item id in brackets. Use when they ask what to do next. Never read the item ids aloud.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `profile_id` | string | yes | `{{profile_id}}` |
| `language` | string | no | ISO code of the language the person is speaking |

### `get_item_details` → `/api/voice/tools/get-item-details`

Description: *Where to go, what documents to bring and the steps for one checklist item or program. Use the item id
from get_checklist.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `item_id` | string | yes | e.g. `health_card` |
| `language` | string | no | ISO code |

### `mark_item_done` → `/api/voice/tools/mark-item-done`

Description: *Mark a checklist step as done. ONLY after the person clearly confirms. Set confirmed to true only then.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `profile_id` | string | yes | `{{profile_id}}` |
| `item_id` | string | yes | from get_checklist |
| `person_key` | string | no | only if the person said which family member (`self`, `child-1`, ...); empty marks every row |
| `confirmed` | boolean | yes | true only after a clear yes |

### `get_roadmap` → `/api/voice/tools/roadmap` (older roadmap; optional)

Description: *Get the person's next steps as a newcomer (from human-written, official-source steps). Use when they
ask what to do next or where to start.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `language` | string | no | ISO 639-1 code |
| `channel` | string | no | `{{channel}}` |
| `profile_id` | string | no | `{{profile_id}}` |
| `status` | string | no | `refugee_pr`, `international_student` or `unknown`, only if the person said it and there is no profile |
| `has_children` | boolean | no | only if the person said it |

### `create_handoff` → `/api/voice/tools/handoff`

Description: *Send the person's request to a free settlement worker. ONLY call after the person clearly agreed to
share their request and contact details.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `need` | string | yes | What they need help with, in their words (no ID numbers) |
| `consent` | boolean | yes | `true` only after explicit agreement |
| `contact_method` | string | yes | `phone`, `text`, `whatsapp`, `email` or `in_person` |
| `contact_value` | string | no | Phone number or email they gave (not needed for `in_person`) |
| `preferred_time` | string | no | When they prefer to be contacted |
| `language` | string | no | ISO 639-1 code |
| `channel` | string | no | `{{channel}}` |
| `profile_id` | string | no | `{{profile_id}}` |

### `check_scam` → `/api/voice/tools/scam-check`

Description: *Check a suspicious call, text, email or letter against official fraud warnings. Read the returned
`text` aloud.*

| Body param | Type | Required | Value / description |
|---|---|---|---|
| `description` | string | yes | What the caller or message said or asked for |
| `language` | string | no | ISO 639-1 code |
| `channel` | string | no | `{{channel}}` |

Set a tool timeout of about 20 seconds (answers take a few seconds: classification, search, grounded answer).

## 7. Test it

1. Start the backend and frontend, sign-in is not needed.
2. Open `/ar`, press **Start speaking**, allow the microphone, and ask in Arabic: "كيف أحصل على بطاقة صحية؟".
3. The status shows Listening → Thinking (tool call) → Speaking, and the transcript appears.
4. In the database, the call shows up as a `voice_web` row:
   `SELECT time, channel, language, topic, answered FROM request_log ORDER BY time DESC LIMIT 5;`
5. A call without the header is refused: `curl -X POST https://<DOMAIN>/api/voice/tools/ask -d '{}'` → `401`.

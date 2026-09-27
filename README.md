# Arrive

**The immigrant's best friend.** Official government information, explained for newcomers in their own language,
by text or voice, with a real person when they need one, and anonymized needs data that helps government serve them better.

Built for the Hack the Hill Civic Technology Challenge. Specification: [docs/SPEC.md](docs/SPEC.md), with the redesign in
[docs/REDESIGN.md](docs/REDESIGN.md) (voice onboarding, household checklist, programs, staff cards), which overrides it.
Project rules for AI-assisted work: [CLAUDE.md](CLAUDE.md). Unverified facts to check: [docs/VERIFY.md](docs/VERIFY.md).
Voice agent setup: [docs/ELEVENLABS_AGENT.md](docs/ELEVENLABS_AGENT.md).

| People served | Institutions | Interaction improved |
|---|---|---|
| Government-Assisted Refugees arriving in Ottawa as permanent residents, with their families (English, French, Arabic, Dari, Pashto, Tigrinya) | IRCC, CRA, Service Canada, ServiceOntario, City of Ottawa, settlement agencies | Getting official information in your language, knowing what to do next, reaching a real person, and showing institutions what newcomers struggle with |

## How it works

```
Browser (Next.js) ──► Caddy (HTTPS) ──► /api/* ──► FastAPI ──► Gemini (answers, classification, letters, embeddings)
                                    └─► /*     ──► Next.js           ──► Tiger Data (pgvector, hypertables, continuous aggregates)
Web voice ──► ElevenLabs agent ──► /api/voice/tools/* (FastAPI)      ──► ElevenLabs (read-aloud)
Staff pages ──► Auth0 login ──► Next.js server ──► FastAPI (JWT + role checks)
Daily: APScheduler ──► re-ingest official pages ──► change detection (source_snapshots hypertable)
```

| Part | Tech | Sponsor use |
|---|---|---|
| Answers | Gemini (`google-genai`): classification, grounded answers with validated citations, letter photos (vision), translation, handoff summaries, needs brief, embeddings | Gemini |
| Voice | Voice onboarding with ElevenLabs Scribe speech-to-text and read-aloud; the ElevenLabs agent with checklist tools | ElevenLabs |
| Data | Tiger Cloud: pgvector search, `request_log`, `source_snapshots` and `session_events` hypertables, continuous aggregates (requests, program interest, checklist activity) with real-time aggregation, retention policy | Tiger Data |
| Staff auth | Auth0: roles `settlement_worker`, `gov_analyst`, `admin` in a namespaced claim, RS256 JWT checks in the API, MFA for staff | Auth0 |
| Hosting | Docker Compose + Caddy on Vultr | Vultr |
| Domain | GoDaddy Registry domain with automatic HTTPS | GoDaddy Registry |

Voice runs in the web app only. The phone line and Twilio were removed from scope.

## Setup

### 1. Environment files

Copy each example and fill in the values. Real `.env` files are git-ignored and must never be committed.

```sh
cp .env.example .env                    # DOMAIN, NEXT_PUBLIC_ELEVENLABS_AGENT_ID
cp backend/.env.example backend/.env    # database, Gemini, ElevenLabs, Auth0, ...
cp frontend/.env.example frontend/.env  # API URLs, Auth0 web app, ElevenLabs agent
```

Generate secrets with `openssl rand -hex 32` (`AUTH0_SECRET`) and `openssl rand -base64 32` (`VOICE_TOOL_SECRET`).
Model names (Gemini, ElevenLabs) always come from env and are never hard-coded.

### 2. Backend

```sh
cd backend
python -m venv .venv
# Windows: the elevenlabs package has very long file paths. If pip fails with "No such file or directory",
# create the venv at a short path instead, e.g.  python -m venv C:\Users\<you>\.venvs\arrive
.venv/bin/pip install -r requirements-dev.txt      # Windows: .venv\Scripts\pip
python -m app.db.migrate                           # create tables, hypertables, continuous aggregates, policies
python ../ingestion/ingest.py                      # fetch, chunk and embed the official pages (~2 minutes)
python -m scripts.seed_sample_insights             # optional: SAMPLE dashboard data, handoffs, session events, survey
uvicorn app.main:app --reload                      # http://localhost:8000/api/health  (docs: /api/docs)
pytest                                             # ~280 tests, all external services mocked
```

New in the redesign (`backend/.env`, see `backend/.env.example`):

| Variable | What it is |
|---|---|
| `PII_ENCRYPTION_KEY` | Fernet key for first names and handoff contacts. `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ANALYTICS_SALT` | long random string; session events store a salted hash of the profile |
| `ELEVENLABS_STT_MODEL` | Scribe speech-to-text model for voice onboarding (for example `scribe_v2`) |
| `ELEVENLABS_TTS_MODEL_EXTENDED` | optional second TTS model for languages the default model lacks; Pashto needs one (for example `eleven_v3`) |
| `ELEVENLABS_ZERO_RETENTION` | `true` only on an ElevenLabs enterprise plan |

The frontend has one optional runtime variable, `GOOGLE_MAPS_EMBED_KEY` (Google maps on item pages; OpenStreetMap
otherwise). UI strings for Dari, Pashto and Tigrinya are drafts: `python -m scripts.draft_ui_translations prs ps ti`
fills new keys with Gemini, and `npm run lint` checks that every locale has the same keys.

Other ingestion commands: `python ingest.py --check-urls` (fetch and parse every source, no database) and
`python ingest.py --only ontario.ca` (one subset). Remove sample data with `python -m scripts.seed_sample_insights --clear`.

TLS to the database follows the `sslmode` in `DATABASE_URL`, the same way as `psql`/libpq: `require` encrypts but
does not verify the certificate (Tiger Cloud's default URL); `verify-ca` / `verify-full` verify it against the system
trust store or the CA file in `DB_SSL_ROOT_CERT`. Migrations, ingestion, scripts and the API all use the same rules
(`backend/app/db/tls.py`).

The Tiger Cloud database listens on a non-standard port. Some venue or campus Wi-Fi networks block it; then
`/api/health` returns `503 {"db": "unavailable"}` and migrations time out. Use a phone hotspot or another network.

### 3. Frontend

```sh
cd frontend
npm install
npm run dev        # http://localhost:3000 (redirects to /en, /fr or /ar based on the browser language)
npm run lint
npm run test:a11y  # axe accessibility checks on the main pages (needs `npx playwright install chromium` once)
```

- Newcomer pages: `/[locale]/...` (`en`, `fr`, `ar`; Arabic is right-to-left). No account.
- Staff pages: `/worker` (settlement workers) and `/insights` (government analysts). Auth0 login.
- Design tokens (colours, fonts, radius) are in `frontend/src/app/globals.css` under `@theme`
  (Tailwind 4 reads its theme from CSS, so there is no `tailwind.config.ts`).
- UI strings are in `frontend/messages/*.json`. `fr` and `ar` are drafts that need native speaker review.

### 4. Full stack with Docker

```sh
docker compose up --build     # https://localhost (self-signed local certificate)
docker compose exec backend python -m app.db.migrate
docker compose exec backend python ../ingestion/ingest.py
```

## Auth0 setup

1. **API:** Applications → APIs → Create API. Identifier `https://api.arrive.app` (this is `AUTH0_AUDIENCE`), signing RS256.
2. **Application:** a *Regular Web Application* (its client id and secret go in `frontend/.env`). Set:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback, https://<DOMAIN>/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000, https://<DOMAIN>`
   - Allowed Web Origins: `http://localhost:3000, https://<DOMAIN>`
3. **Roles:** User Management → Roles: `settlement_worker`, `gov_analyst`, `admin`. Assign them to staff users
   (for the demo: `worker@test.com` → `settlement_worker`, `analyst@test.com` → `gov_analyst`).
4. **MFA:** Security → Multi-factor Auth → enable at least one factor (for example One-time Password). Leave the
   policy on "Never"; the Action below requires MFA only for staff.
5. **Action:** Actions → Library → Create Action → *Login / Post Login*, paste the code, Deploy, then add it to the
   Login flow (Actions → Triggers → post-login):

```js
/**
 * Arrive: put roles in the tokens (namespaced claims) and require MFA for staff.
 * The API reads roles from https://arrive.app/roles in the ACCESS token;
 * the web app reads the same claim from the ID token to show the right pages.
 */
exports.onExecutePostLogin = async (event, api) => {
  const ns = "https://arrive.app";
  const roles = (event.authorization && event.authorization.roles) || [];
  api.idToken.setCustomClaim(`${ns}/roles`, roles);
  api.accessToken.setCustomClaim(`${ns}/roles`, roles);
  if (event.user.email) api.accessToken.setCustomClaim(`${ns}/email`, event.user.email);

  const STAFF = ["settlement_worker", "gov_analyst", "admin"];
  const isStaff = roles.some((r) => STAFF.includes(r));
  const didMfa = (event.authentication?.methods || []).some((m) => m.name === "mfa");
  if (isStaff && !didMfa) {
    api.multifactor.enable("any", { allowRememberBrowser: false });
  }
};
```

After changing roles, sign out and in again so the tokens pick them up. An account without the needed role sees a
friendly "You don't have access" page; the API also refuses it (`403`).

## Deploy (Vultr + GoDaddy Registry)

1. **Server:** Vultr → Deploy → Cloud Compute, Ubuntu 24.04, 2 vCPU / 4 GB is plenty. Add your SSH key.
2. **Docker:** `curl -fsSL https://get.docker.com | sh` then `sudo usermod -aG docker $USER` (log out and in).
   Check `docker compose version` is v2.24 or newer (needed for the optional frontend env files).
3. **Firewall:** allow 22, 80, 443 (TCP) and 443 (UDP) only: `sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable`.
4. **Code:** `git clone <repo> arrive && cd arrive`, then create `.env`, `backend/.env`, `frontend/.env` (copy from your
   laptop with `scp`, never through git). For production set:
   - `.env`: `DOMAIN=<your domain>`
   - `backend/.env`: `CORS_ORIGINS=https://<DOMAIN>`, `PUBLIC_BASE_URL=https://<DOMAIN>`
   - `frontend/.env` **or** `frontend/.env.local` (either works; `.env.local` wins if both exist):
     `APP_BASE_URL=https://<DOMAIN>`. These are runtime values only. Env files are never copied into the image;
     the one public build value, `NEXT_PUBLIC_API_BASE_URL`, is set to `/api` by compose.
5. **DNS:** in the GoDaddy Registry domain's DNS, add **A records** `@` → the server's IPv4 and `www` → the same IPv4.
   Caddy redirects `www.<DOMAIN>` permanently to `https://<DOMAIN>`. Wait until `dig +short <DOMAIN>` and
   `dig +short www.<DOMAIN>` both return the IP.
6. **Run:** `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically on first request.
7. **Database** (in order; the backend container's working directory is `/srv/backend`):
   ```sh
   docker compose exec backend python -m app.db.migrate                 # tables, hypertables, aggregates, policies
   docker compose restart backend                                        # loads the roadmap step templates on startup
   docker compose exec backend python ../ingestion/ingest.py            # fetch + embed official pages (~2-3 min)
   docker compose exec backend python -m scripts.seed_sample_insights   # optional SAMPLE dashboard data
   ```
   Or on the host with Python 3.12 (Ubuntu 24.04: `sudo apt install -y python3-venv`), using `backend/.env`:
   ```sh
   cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   .venv/bin/python -m app.db.migrate && docker compose restart backend
   .venv/bin/python ../ingestion/ingest.py
   .venv/bin/python -m scripts.seed_sample_insights
   ```
8. **Auth0:** add the `https://<DOMAIN>` URLs above.
9. **ElevenLabs:** set each tool URL to `https://<DOMAIN>/api/voice/tools/...` and add the domain to Allowed hosts.
10. **Check:** `curl https://<DOMAIN>/api/health` → `{"status":"ok","db":"ok"}`.

Updates: `git pull && docker compose up -d --build`. Logs: `docker compose logs -f backend` (no user content is logged).

## Privacy by design

- `request_log` stores only fixed categories (channel, kind, language, topic, status, city-level region, flags,
  source ids, clarity). No question text, names or contact details. The only free text, `gap_summary`, is a generic
  description written by Gemini and then scrubbed by regexes (`backend/app/services/privacy.py`).
- Letter photos are read into memory, sent to Gemini and discarded. Never written to disk or the database.
- Insights suppress any group smaller than `INSIGHTS_MIN_GROUP_SIZE` (5): it shows as `"<5"`.
- Handoffs are only created with explicit consent. `contact_value` and profile first names are encrypted at rest
  with Fernet (`PII_ENCRYPTION_KEY`); without a key they are never stored in plain text.
- Newcomers need no account; the profile is a random readable ID (`ARV-XXXX-XXXX-XXXX`) kept on their phone. Voice
  answers are transcribed in memory; audio and transcripts are never stored, only the confirmed values.
- `session_events` hold fixed event names, a salted hash of the profile (`ANALYTICS_SALT`), language, a coarse
  household type and city; country of origin only with consent (off by default). Deleting a profile unlinks them.
- Staff cards put all their data in the URL fragment (after `#`), which browsers never send to a server, so
  scanning the QR code stores or logs nothing.

## Demo script (about 5 minutes)

1. **Language screen** (`/`): English, French, Arabic, Hindi, Mandarin, Spanish. Pick **العربية**.
2. **Voice onboarding as Amira**: Aba greets her automatically (male voice) and asks seven questions. Tap to speak
   ("I have two adults and one child"): the answer is transcribed by the same ElevenLabs agent as Ask Aba, understood
   on the phone (src/lib/understand.ts) and filled in. Every label shows English + Arabic. Summary, then the Arrive ID.
3. **Home**: "Hello, Amira", checklist by phase (Day 1–3 ... Months 4–6), "Government-run programs" (title only),
   and "Ask Aba".
4. **SIN step**: location card, Open Google Maps, documents, steps. Step 2 has the ID button: a large QR code. Scan it
   with a second phone: the English page for staff (/en/for-staff), nothing sent to the server.
5. **Ask Aba**: "Where do I get my health card?" → Aba answers by name, with the Ottawa address and phone.
6. **Hindi or Mandarin** (`/hi`, `/zh`): the same flow, voice included.
7. **End session**: five faces and "what is missing?" by voice.
8. **Needs dashboard** (`/insights`, analyst): program interest by language (suppressed under 5), checklist
   bottlenecks, survey satisfaction and themes; the worker inbox (`/worker`) for handoffs.

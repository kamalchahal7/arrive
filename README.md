# Arrive

**The immigrant's best friend.** Official government information, explained for newcomers in their own language,
by text or voice, with a real person when they need one, and anonymized needs data that helps government serve them better.

Built for the Hack the Hill Civic Technology Challenge. Full specification: [docs/SPEC.md](docs/SPEC.md).
Project rules for AI-assisted work: [CLAUDE.md](CLAUDE.md). Unverified facts to check: [docs/VERIFY.md](docs/VERIFY.md).
Voice agent setup: [docs/ELEVENLABS_AGENT.md](docs/ELEVENLABS_AGENT.md).

| People served | Institutions | Interaction improved |
|---|---|---|
| Newcomers to Canada, starting with refugee families, sponsored seniors and international students in Ottawa | IRCC, CRA, Service Canada, ServiceOntario, City of Ottawa, settlement agencies | Getting official information in your language, knowing what to do next, reaching a real person, and showing institutions what newcomers struggle with |

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
| Voice | ElevenLabs agent in the web app with 4 server tools; ElevenLabs multilingual read-aloud | ElevenLabs |
| Data | Tiger Cloud: pgvector search, `request_log` and `source_snapshots` hypertables, daily/weekly continuous aggregates with real-time aggregation, retention policy | Tiger Data |
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
python -m scripts.seed_sample_insights             # optional: 8 weeks of SAMPLE dashboard data + 4 sample handoffs
uvicorn app.main:app --reload                      # http://localhost:8000/api/health  (docs: /api/docs)
pytest                                             # 58 tests, all external services mocked
```

Other ingestion commands: `python ingest.py --check-urls` (fetch and parse every source, no database) and
`python ingest.py --only ontario.ca` (one subset). Remove sample data with `python -m scripts.seed_sample_insights --clear`.

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
3. **Firewall:** allow 22, 80, 443 (TCP) and 443 (UDP) only: `sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable`.
4. **Code:** `git clone <repo> arrive && cd arrive`, then create `.env`, `backend/.env`, `frontend/.env` (copy from your
   laptop with `scp`, never through git). For production set:
   - `.env`: `DOMAIN=<your domain>`
   - `backend/.env`: `CORS_ORIGINS=https://<DOMAIN>`, `PUBLIC_BASE_URL=https://<DOMAIN>`
   - `frontend/.env`: `APP_BASE_URL=https://<DOMAIN>` (`NEXT_PUBLIC_API_BASE_URL` is set to `/api` by compose)
5. **DNS:** in the GoDaddy Registry domain's DNS, add an **A record** `@` → the server's IPv4 (and `www` if you want it).
   Wait until `dig +short <DOMAIN>` returns the IP.
6. **Run:** `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically on first request.
7. **Database:** `docker compose exec backend python -m app.db.migrate`, then
   `docker compose exec backend python ../ingestion/ingest.py`, and optionally
   `docker compose exec backend python -m scripts.seed_sample_insights`.
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
- Handoffs are only created with explicit consent; they hold what the person chose to send.
  `contact_value` is stored in plain text for the MVP (TODO: encrypt at rest).
- Newcomers need no account; the profile is an anonymous uuid on their device and can be deleted in Settings.

## Demo script (about 4 minutes)

1. **Welcome, in Arabic** (`/ar`): right-to-left layout, big language buttons, "no account needed" line.
2. **Onboarding as Amira**: permanent resident, arrived less than a month ago, Ottawa, children yes, seniors no. Read-aloud on each question.
3. **Roadmap**: "Week 3 in Canada", progress bar, *Do this now* card with "Unlocks …" badges. Open a step: what to bring,
   where, official source with "last checked". Tap **Show this to staff**: bilingual card, make text bigger.
4. **Ask** (in Arabic): "كيف أحصل على بطاقة صحية؟" → grounded answer with ontario.ca source, Listen, "Was this clear?".
   Then a case-specific question ("Should I sponsor my brother now or wait?") → handoff card, not advice.
5. **Voice**: press Start speaking, ask in Arabic; status Listening → Thinking → Speaking with live transcript.
6. **Letters**: upload a sample letter (team-made, in `docs/demo/`) → sender, "Do I need to do something?", deadline →
   Add deadline to my roadmap.
7. **Is it real?**: "Someone called saying I owe CRA money and must pay with gift cards" → likely scam, reasons,
   "The government will never…", report to the Canadian Anti-Fraud Centre.
8. **Worker inbox** (`/worker`, sign in as the worker): sample handoffs sorted by urgency; the handoff just created appears.
9. **Needs dashboard** (`/insights`, sign in as the analyst): Sample data badge, housing spike, language demand,
   knowledge gaps, "<5" small groups, **Generate needs brief**.
10. Sign in with the analyst on `/worker` → friendly access-denied page (roles enforced in the UI and the API).

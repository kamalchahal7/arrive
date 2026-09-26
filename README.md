# Arrive

**The immigrant's best friend.** Official government information, explained for newcomers in their own language,
by text or voice, with a real person when they need one, and anonymized needs data that helps government serve them better.

Built for the Hack the Hill Civic Technology Challenge. Full specification: [docs/SPEC.md](docs/SPEC.md).
Project rules for AI-assisted work: [CLAUDE.md](CLAUDE.md). Unverified facts to check: [docs/VERIFY.md](docs/VERIFY.md).

## Stack

| Part | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, asyncpg, `google-genai`, `elevenlabs`, APScheduler |
| Database | Tiger Data (Tiger Cloud: PostgreSQL + TimescaleDB + pgvector) |
| Frontend | Next.js 16 (App Router), Tailwind CSS 4, next-intl, lucide-react |
| Auth | Auth0 (roles `settlement_worker`, `gov_analyst`, `admin`) |
| Voice | ElevenLabs agent (web + phone via Twilio) |
| Hosting | Docker Compose on Vultr, Caddy for HTTPS, GoDaddy Registry domain |

## Setup

### 1. Environment files

Copy each example and fill in the values. Real `.env` files are git-ignored and must never be committed.

```sh
cp .env.example .env                    # DOMAIN, NEXT_PUBLIC_ELEVENLABS_AGENT_ID
cp backend/.env.example backend/.env    # database, Gemini, ElevenLabs, Auth0, ...
cp frontend/.env.example frontend/.env  # API URL, Auth0 web app, ElevenLabs agent
```

Generate secrets with `openssl rand -hex 32` (`AUTH0_SECRET`) and `openssl rand -base64 32` (`VOICE_TOOL_SECRET`).

### 2. Backend (local)

```sh
cd backend
python -m venv .venv
# Windows: the elevenlabs package has very long file paths. If pip fails with "No such file or directory",
# create the venv at a short path instead, e.g.  python -m venv C:\Users\<you>\.venvs\arrive
.venv/bin/pip install -r requirements-dev.txt      # Windows: .venv\Scripts\pip
uvicorn app.main:app --reload                      # http://localhost:8000/api/health
pytest
```

The Tiger Cloud database listens on a non-standard port (not 443). Some venue or campus Wi-Fi networks block it,
and `/api/health` then returns `503 {"db": "unavailable"}`. Use a phone hotspot or another network in that case.

### 3. Frontend (local)

```sh
cd frontend
npm install
npm run dev        # http://localhost:3000 (redirects to /en, /fr or /ar based on the browser language)
```

Design tokens (colors, fonts, radius) live in `frontend/src/app/globals.css` under `@theme`.
Tailwind 4 reads its theme from CSS, so there is no `tailwind.config.ts`.
UI strings are in `frontend/messages/*.json`. `fr` and `ar` are drafts that need native speaker review.

### 4. Full stack with Docker

```sh
docker compose up --build     # https://localhost (self-signed local certificate)
```

## Environment variables

Every variable is listed with a comment in the three `.env.example` files. Model names (Gemini, ElevenLabs) always come
from env and are never hard-coded.

## Dashboards and manual setup

_Filled in as each phase lands._

- **Tiger Cloud**: service `arrive_mlh`. Migrations: `cd backend && python -m app.db.migrate` (Phase 1).
- **Auth0**: API, roles, the roles-claim Action, MFA for staff (Phase 6).
- **ElevenLabs**: agent prompt, tools, Twilio number import; see `docs/ELEVENLABS_AGENT.md` (Phase 5).
- **Google AI Studio**: Gemini API key.

## Deploy (Vultr + GoDaddy)

_Written in full in Phase 8._ Outline: create an Ubuntu instance on Vultr, install Docker, clone the repo, create
the env files, point the GoDaddy Registry domain's DNS A record at the server IP, set `DOMAIN` in `.env`,
`docker compose up -d --build`, run migrations and ingestion, then update Auth0 callback URLs and ElevenLabs tool URLs.

## Demo script

_Written in Phase 9._

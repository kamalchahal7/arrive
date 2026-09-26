# Arrive: project rules for Claude Code

Arrive is a hackathon project for the Hack the Hill Civic Technology Challenge. It helps newcomers to Canada
(starting with refugee families and sponsored seniors in Ottawa) understand official government information
in their own language, by text or voice, and it shows institutions what newcomers need through anonymized data.

The full specification is in `docs/SPEC.md`. Read it before starting any phase. Build in the phases it defines,
and stop at the end of each phase to summarize what you did and wait for approval.

## Non-negotiable rules

1. **Official sources only.** Answers about government services must come only from retrieved passages of
   official pages (canada.ca, ontario.ca, ottawa.ca). Every answer shows its sources. If the passages don't
   contain the answer, say so and offer a person. Never answer from general model knowledge.
2. **Information, not advice.** Never recommend an immigration decision for someone's specific case
   ("should I apply for X?"). Those questions go to the handoff flow.
3. **Never invent government facts.** Do not make up requirements, deadlines, fees, phone numbers, addresses or
   URLs. Use clearly marked placeholders like `[VERIFY: ...]` and list them in the phase summary.
4. **Privacy by design.** The request log never stores names, contact details, exact addresses or raw question
   text. Uploaded letter photos are processed in memory and never written to disk or the database.
   Insights endpoints suppress any group with fewer than 5 records.
5. **Accessibility is a feature, not polish.** WCAG 2.1 AA basics, right-to-left layout for Arabic,
   keyboard navigation, visible focus, 44px touch targets, labels on every control, read-aloud available.
6. **No secrets in the repo.** All keys go in `.env` files that are git-ignored. Keep `.env.example` files updated.
7. **Check current docs, not memory.** SDKs for Gemini (`google-genai`), ElevenLabs, Auth0 and Tiger Data change
   often. When unsure of an API, check the official docs or installed package source before writing code.
   Model names must come from environment variables, never hard-coded.
8. **Ask before adding** a major dependency or service that is not in the spec.

## Stack (summary)

- Backend: Python 3.11+, FastAPI, Pydantic v2, asyncpg, `google-genai`, `elevenlabs`, APScheduler, pytest
- Database: Tiger Data (Tiger Cloud, PostgreSQL with TimescaleDB and pgvector)
- Frontend: Next.js (App Router, TypeScript), Tailwind CSS, next-intl, Recharts, `@elevenlabs/react`, `@auth0/nextjs-auth0`
- Auth: Auth0 (roles: `settlement_worker`, `gov_analyst`, `admin`)
- Voice: ElevenLabs agent in the web app only (the phone line and Twilio were removed from scope)
- Hosting: Docker Compose on a Vultr server with Caddy (automatic HTTPS); domain from GoDaddy Registry

## Commands (fill in as the project grows)

- Backend dev: `cd backend && uvicorn app.main:app --reload`
- Backend tests: `cd backend && pytest`
- Run migrations: `cd backend && python -m app.db.migrate`
- Ingest sources: `cd ingestion && python ingest.py`
- Frontend dev: `cd frontend && npm run dev`
- Full stack: `docker compose up --build`

## Style

- Python: type hints everywhere, small modules, services separate from routers, async I/O.
- TypeScript: strict mode, server components by default, client components only where needed.
- User-facing text: plain language at about a grade 6 reading level. No jargon without an explanation.
- Keep commits small and descriptive.

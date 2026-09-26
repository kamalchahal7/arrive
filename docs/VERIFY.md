# Items to verify

Every `[VERIFY: ...]` marker in the code or data is listed here. A person on the team checks each one against
the official source (or a native speaker for translations), then fills in "Checked by" and the date.
Do not remove a marker from the code until its row here is checked.

| # | Item | Where | Added in | Checked by | Date |
|---|---|---|---|---|---|
| 1 | French UI strings (draft translation) | `frontend/messages/fr.json` | Phase 0 | | |
| 2 | Arabic UI strings (draft translation) | `frontend/messages/ar.json` | Phase 0 | | |
| 3 | Welcome greetings in Arabic, Farsi, Spanish, Ukrainian | `frontend/src/app/[locale]/page.tsx` | Phase 0 | | |
| 4 | Gemini model names in `backend/.env` (`gemini-flash-latest`, `gemini-embedding-001`) still current | `backend/.env` | Phase 0 | | |
| 5 | ElevenLabs TTS model name (`eleven_multilingual_v2`) still the best multilingual choice | `backend/.env` | Phase 0 | | |

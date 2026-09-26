-- Regular tables. {{EMBEDDING_DIM}} is filled in by the migration runner from settings.

CREATE TABLE IF NOT EXISTS sources (
    id              serial PRIMARY KEY,
    url             text NOT NULL UNIQUE,
    title           text NOT NULL,
    jurisdiction    text NOT NULL CHECK (jurisdiction IN ('federal', 'ontario', 'ottawa')),
    language        text NOT NULL DEFAULT 'en',
    topics          text[] NOT NULL DEFAULT '{}',
    last_fetched_at timestamptz,
    last_changed_at timestamptz,
    content_hash    text,
    active          boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS source_chunks (
    id           bigserial PRIMARY KEY,
    source_id    int NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    chunk_index  int NOT NULL,
    heading_path text NOT NULL DEFAULT '',
    text         text NOT NULL,
    language     text NOT NULL DEFAULT 'en',
    embedding    vector({{EMBEDDING_DIM}}) NOT NULL,
    token_count  int NOT NULL DEFAULT 0,
    UNIQUE (source_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS source_chunks_source_idx ON source_chunks (source_id);
CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx
    ON source_chunks USING hnsw (embedding vector_cosine_ops);

-- Human-written roadmap steps, seeded from app/data/step_templates.json on startup.
CREATE TABLE IF NOT EXISTS step_templates (
    id           text PRIMARY KEY,
    title_en     text NOT NULL,
    summary_en   text NOT NULL,
    conditions   jsonb NOT NULL DEFAULT '{}',
    documents    jsonb NOT NULL DEFAULT '[]',
    where_en     text NOT NULL DEFAULT '',
    timing       jsonb NOT NULL DEFAULT '{}',
    source_url   text NOT NULL,
    topic        text NOT NULL,
    order_hint   int NOT NULL DEFAULT 100,
    unlocks      text[] NOT NULL DEFAULT '{}',
    reviewed     boolean NOT NULL DEFAULT false,
    content_hash text NOT NULL DEFAULT ''
);

-- Gemini translations of templates, cached per language. content_hash invalidates stale rows.
CREATE TABLE IF NOT EXISTS template_translations (
    template_id  text NOT NULL REFERENCES step_templates(id) ON DELETE CASCADE,
    language     text NOT NULL,
    content      jsonb NOT NULL,
    content_hash text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (template_id, language)
);

-- Anonymous profiles. No names, no contact details.
CREATE TABLE IF NOT EXISTS profiles (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth0_sub          text,
    status             text NOT NULL DEFAULT 'unknown',
    arrival_date       date,
    city               text NOT NULL DEFAULT 'unknown',
    province           text NOT NULL DEFAULT 'unknown',
    has_children       boolean,
    has_seniors        boolean,
    languages          text[] NOT NULL DEFAULT '{}',
    preferred_language text NOT NULL DEFAULT 'en',
    needs              text[] NOT NULL DEFAULT '{}',
    created_at         timestamptz NOT NULL DEFAULT now()
);

-- A step on someone's roadmap. uuid ids so steps can't be guessed. Custom steps (e.g. a deadline from a
-- decoded letter) have no template.
CREATE TABLE IF NOT EXISTS user_steps (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    template_id  text REFERENCES step_templates(id) ON DELETE CASCADE,
    custom_title text,
    custom_note  text,
    status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'skipped')),
    due_date     date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CHECK (template_id IS NOT NULL OR custom_title IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_steps_profile_template_idx
    ON user_steps (profile_id, template_id) WHERE template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS handoffs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    language         text NOT NULL,
    topic            text NOT NULL DEFAULT 'other',
    summary          text NOT NULL,
    summary_native   text,
    already_done     text,
    household        text,
    status_category  text NOT NULL DEFAULT 'unknown',
    contact_method   text NOT NULL CHECK (contact_method IN ('phone', 'text', 'whatsapp', 'email', 'in_person')),
    -- TODO(privacy): encrypt contact_value at rest (e.g. pgcrypto with a key from env) before real use.
    contact_value    text,
    preferred_time   text,
    consent          boolean NOT NULL CHECK (consent),
    status           text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
    assigned_to      text,
    urgency          text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'high', 'emergency')),
    deadline         date,
    channel          text NOT NULL DEFAULT 'web',
    is_sample        boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS handoffs_status_idx ON handoffs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS reminders (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    user_step_id uuid REFERENCES user_steps(id) ON DELETE CASCADE,
    send_at      timestamptz NOT NULL,
    channel      text NOT NULL DEFAULT 'in_app',
    sent_at      timestamptz
);

-- Read-aloud audio cache (official-information answers only, never user questions).
CREATE TABLE IF NOT EXISTS tts_cache (
    key        text PRIMARY KEY,
    audio      bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Small key/value cache for expensive derived results (e.g. knowledge-gap clusters, translations).
CREATE TABLE IF NOT EXISTS app_cache (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Redesign R1 (docs/REDESIGN.md sections 4, 5, 9): household profiles, checklist progress, translation cache.
-- Session events, survey responses and their aggregates arrive in a later migration (R4).

-- Profiles: the readable ID (public_id) is what the person sees and uses to reopen their profile.
-- The uuid primary key stays internal so existing roadmap and handoff code keeps working.
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS public_id         text,
    ADD COLUMN IF NOT EXISTS first_name_enc    bytea,     -- encrypted at rest (written from R2 on)
    ADD COLUMN IF NOT EXISTS city_name         text,      -- free text city name when city = 'other'
    ADD COLUMN IF NOT EXISTS country_of_origin text,      -- ISO 3166-1 alpha-2, analytics only
    ADD COLUMN IF NOT EXISTS gender            text,      -- analytics only, never changes the checklist
    ADD COLUMN IF NOT EXISTS self_age_group    text NOT NULL DEFAULT 'adult',
    ADD COLUMN IF NOT EXISTS adults            smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS seniors           smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS children_0_5      smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS children_6_17     smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS disability_adult  boolean,
    ADD COLUMN IF NOT EXISTS disability_senior boolean,
    ADD COLUMN IF NOT EXISTS disability_child  boolean,
    ADD COLUMN IF NOT EXISTS other_languages   text[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS analytics_consent boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS last_seen_at      timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_id_idx ON profiles (public_id) WHERE public_id IS NOT NULL;

ALTER TABLE profiles
    ADD CONSTRAINT profiles_public_id_format CHECK (public_id IS NULL OR public_id ~ '^ARV(-[0-9A-HJKMNP-TV-Z]{4}){3}$'),
    ADD CONSTRAINT profiles_self_age_group_check CHECK (self_age_group IN ('adult', 'senior')),
    ADD CONSTRAINT profiles_household_counts_check CHECK (
        adults BETWEEN 0 AND 20 AND seniors BETWEEN 0 AND 20
        AND children_0_5 BETWEEN 0 AND 20 AND children_6_17 BETWEEN 0 AND 20
        AND adults + seniors >= 1
        -- The person themself is one of the adults or seniors.
        AND ((self_age_group = 'adult' AND adults >= 1) OR (self_age_group = 'senior' AND seniors >= 1))
    ),
    ADD CONSTRAINT profiles_country_check CHECK (country_of_origin IS NULL OR country_of_origin ~ '^[A-Z]{2}$');

-- One row per checklist item per person. person_key is stable ('self', 'adult-2', 'senior-1', 'child-1',
-- 'group-child', 'household'); display labels are computed and translated when the checklist is read.
CREATE TABLE IF NOT EXISTS checklist_progress (
    profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_id      text NOT NULL,
    person_key   text NOT NULL,
    status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
    completed_at timestamptz,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, item_id, person_key)
);

-- Gemini translations of checklist items, programs and locations, cached per language.
-- content_hash is a hash of the English source, so edits to the data files invalidate old translations.
CREATE TABLE IF NOT EXISTS content_translations (
    kind         text NOT NULL,
    item_id      text NOT NULL,
    language     text NOT NULL,
    content      jsonb NOT NULL,
    content_hash text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, item_id, language)
);

-- migrate: no-transaction
-- Redesign R4 (docs/REDESIGN.md section 9): anonymized session events, end-of-session survey, aggregates.
-- Never names, free text or profile IDs in events: profile_ref is a salted hash, and country_of_origin is only
-- filled when the person consented. Statements run one by one (continuous aggregates need that).

CREATE TABLE IF NOT EXISTS session_events (
    time              timestamptz NOT NULL DEFAULT now(),
    session_id        text NOT NULL,
    profile_ref       text,
    event             text NOT NULL CHECK (event IN ('view_item', 'view_program', 'program_interest', 'item_done',
                                                     'assistant_question', 'staff_card_opened', 'language_changed')),
    target_id         text,
    language          text NOT NULL,
    country_of_origin text,
    household_type    text NOT NULL DEFAULT 'unknown',
    city              text NOT NULL DEFAULT 'unknown',
    is_sample         boolean NOT NULL DEFAULT false
);

SELECT create_hypertable('session_events', by_range('time', INTERVAL '7 days'), if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS session_events_event_time_idx ON session_events (event, time DESC);

CREATE INDEX IF NOT EXISTS session_events_profile_ref_idx ON session_events (profile_ref, time DESC);

CREATE TABLE IF NOT EXISTS survey_responses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    time             timestamptz NOT NULL DEFAULT now(),
    session_id       text NOT NULL,
    profile_ref      text,
    satisfaction     smallint CHECK (satisfaction BETWEEN 1 AND 5),
    missing_features text,
    language         text NOT NULL,
    is_sample        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS survey_responses_time_idx ON survey_responses (time DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS program_interest_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 week', time) AS bucket,
       target_id, language, country_of_origin, is_sample,
       count(*) AS interested,
       count(DISTINCT profile_ref) AS people
FROM session_events
WHERE event = 'program_interest'
GROUP BY bucket, target_id, language, country_of_origin, is_sample
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS item_activity_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 week', time) AS bucket,
       event, target_id, language, household_type, is_sample,
       count(*) AS total
FROM session_events
WHERE event IN ('view_item', 'item_done', 'view_program', 'staff_card_opened')
GROUP BY bucket, event, target_id, language, household_type, is_sample
WITH NO DATA;

SELECT add_continuous_aggregate_policy('program_interest_weekly',
    start_offset => INTERVAL '180 days', end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('item_activity_weekly',
    start_offset => INTERVAL '180 days', end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

-- survey_responses is a small regular table: a plain view is enough.
CREATE OR REPLACE VIEW survey_weekly AS
SELECT date_trunc('week', time) AS bucket, language, is_sample,
       count(*) AS responses,
       count(satisfaction) AS rated,
       avg(satisfaction)::numeric(3,2) AS satisfaction
FROM survey_responses
GROUP BY 1, 2, 3;

-- Time from profile creation to finishing each checklist item (joins are not allowed in continuous aggregates).
CREATE OR REPLACE VIEW item_completion_times AS
SELECT cp.item_id,
       p.preferred_language AS language,
       extract(epoch FROM (cp.completed_at - p.created_at)) / 86400.0 AS days_to_complete
FROM checklist_progress cp
JOIN profiles p ON p.id = cp.profile_id
WHERE cp.status = 'done' AND cp.completed_at IS NOT NULL;

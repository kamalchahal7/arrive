-- Hypertables (TimescaleDB 2.13+ by_range syntax).

CREATE TABLE IF NOT EXISTS source_snapshots (
    time         timestamptz NOT NULL DEFAULT now(),
    source_id    int NOT NULL,
    content_hash text NOT NULL,
    changed      boolean NOT NULL
);
SELECT create_hypertable('source_snapshots', by_range('time', INTERVAL '30 days'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS source_snapshots_source_idx ON source_snapshots (source_id, time DESC);

-- One anonymized row per interaction. Never raw question text or personal details (see services/privacy.py).
CREATE TABLE IF NOT EXISTS request_log (
    time            timestamptz NOT NULL DEFAULT now(),
    id              uuid NOT NULL DEFAULT gen_random_uuid(),
    channel         text NOT NULL CHECK (channel IN ('web', 'voice_web')),
    kind            text NOT NULL DEFAULT 'ask' CHECK (kind IN ('ask', 'letter', 'scam', 'handoff', 'roadmap')),
    language        text NOT NULL,
    topic           text NOT NULL,
    status_category text NOT NULL DEFAULT 'unknown',
    region          text NOT NULL DEFAULT 'unknown',
    answered        boolean NOT NULL DEFAULT false,
    handed_off      boolean NOT NULL DEFAULT false,
    scam_flag       boolean NOT NULL DEFAULT false,
    clarity         smallint CHECK (clarity IN (-1, 1)),
    source_ids      int[] NOT NULL DEFAULT '{}',
    gap_summary     text,
    is_sample       boolean NOT NULL DEFAULT false
);
SELECT create_hypertable('request_log', by_range('time', INTERVAL '7 days'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS request_log_topic_time_idx ON request_log (topic, time DESC);
CREATE INDEX IF NOT EXISTS request_log_id_idx ON request_log (id, time DESC);

-- Stretch goal: IRCC processing times.
CREATE TABLE IF NOT EXISTS processing_times (
    time             timestamptz NOT NULL,
    application_type text NOT NULL,
    days             int NOT NULL
);
SELECT create_hypertable('processing_times', by_range('time', INTERVAL '90 days'), if_not_exists => TRUE);

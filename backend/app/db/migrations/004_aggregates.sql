-- migrate: no-transaction
-- Continuous aggregates and policies. The runner executes each statement on its own, outside a transaction.
-- materialized_only = false turns on real-time aggregation, so new rows show up immediately in the demo.

CREATE MATERIALIZED VIEW IF NOT EXISTS request_log_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', time) AS bucket,
       topic, language, region, channel, is_sample,
       count(*)                               AS total,
       count(*) FILTER (WHERE answered)       AS answered,
       count(*) FILTER (WHERE handed_off)     AS handed_off,
       count(*) FILTER (WHERE scam_flag)      AS scam_flags,
       count(*) FILTER (WHERE clarity = 1)    AS clarity_up,
       count(*) FILTER (WHERE clarity = -1)   AS clarity_down
FROM request_log
GROUP BY bucket, topic, language, region, channel, is_sample
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS request_log_weekly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 week', time) AS bucket,
       topic, language, region, channel, is_sample,
       count(*)                               AS total,
       count(*) FILTER (WHERE answered)       AS answered,
       count(*) FILTER (WHERE handed_off)     AS handed_off,
       count(*) FILTER (WHERE scam_flag)      AS scam_flags,
       count(*) FILTER (WHERE clarity = 1)    AS clarity_up,
       count(*) FILTER (WHERE clarity = -1)   AS clarity_down
FROM request_log
GROUP BY bucket, topic, language, region, channel, is_sample
WITH NO DATA;

SELECT add_continuous_aggregate_policy('request_log_daily',
    start_offset => INTERVAL '90 days', end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour', if_not_exists => TRUE);

SELECT add_continuous_aggregate_policy('request_log_weekly',
    start_offset => INTERVAL '180 days', end_offset => INTERVAL '1 day',
    schedule_interval => INTERVAL '1 day', if_not_exists => TRUE);

SELECT add_retention_policy('request_log', INTERVAL '{{REQUEST_LOG_RETENTION_DAYS}} days', if_not_exists => TRUE);

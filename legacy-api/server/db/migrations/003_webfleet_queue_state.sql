-- Web — queue temps réel + état réplication trajets
CREATE TABLE IF NOT EXISTS webfleet_queue_state (
  id               SERIAL       PRIMARY KEY,
  queue_name       VARCHAR(50)  UNIQUE NOT NULL,
  msgclass         INT          NOT NULL,
  last_acked_msgid BIGINT       DEFAULT 0,
  queue_active     BOOLEAN      DEFAULT false,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webfleet_sync_state (
  id           SERIAL       PRIMARY KEY,
  sync_type    VARCHAR(50)  UNIQUE NOT NULL,
  last_value   BIGINT       DEFAULT 0,
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO webfleet_sync_state (sync_type, last_value)
VALUES ('trips_replication', 0)
ON CONFLICT (sync_type) DO NOTHING;

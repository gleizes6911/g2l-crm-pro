CREATE TABLE IF NOT EXISTS webfleet_alerts (
  id               SERIAL PRIMARY KEY,
  alert_type       VARCHAR(50) NOT NULL,
  objectno         VARCHAR(10) NOT NULL,
  objectname       VARCHAR(255),
  drivername       VARCHAR(255),
  msg_time         TIMESTAMPTZ NOT NULL,
  msg_text         TEXT,
  speed            INT,
  pos_latitude     DECIMAL(10,7),
  pos_longitude    DECIMAL(10,7),
  pos_text         TEXT,
  raw_msgid        BIGINT,
  acknowledged     BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_objectno ON webfleet_alerts (objectno);
CREATE INDEX IF NOT EXISTS idx_alerts_msg_time ON webfleet_alerts (msg_time DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON webfleet_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_ack ON webfleet_alerts (acknowledged);

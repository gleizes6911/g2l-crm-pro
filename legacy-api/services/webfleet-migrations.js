const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runWebfleetMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS webfleet_vehicles (
        objectno       VARCHAR(10)    PRIMARY KEY,
        objectname     VARCHAR(255),
        objecttype     VARCHAR(100),
        latitude       DECIMAL(10,7),
        longitude      DECIMAL(10,7),
        pos_time       TIMESTAMPTZ,
        speed          INT,
        course         INT,
        direction      INT,
        status         CHAR(1),
        ignition       SMALLINT,
        ignition_time  TIMESTAMPTZ,
        standstill     SMALLINT,
        tripmode       SMALLINT,
        odometer       BIGINT,
        driver         VARCHAR(20),
        drivername     VARCHAR(255),
        postext        TEXT,
        fuellevel      INT,
        objectuid      VARCHAR(30),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webfleet_trips (
        tripid                   BIGINT         PRIMARY KEY,
        objectno                 VARCHAR(10),
        objectname               VARCHAR(255),
        objectuid                VARCHAR(30),
        tripmode                 SMALLINT,
        start_time               TIMESTAMPTZ,
        end_time                 TIMESTAMPTZ,
        start_odometer           BIGINT,
        end_odometer             BIGINT,
        start_lat                DECIMAL(10,7),
        start_lng                DECIMAL(10,7),
        end_lat                  DECIMAL(10,7),
        end_lng                  DECIMAL(10,7),
        start_postext            TEXT,
        end_postext              TEXT,
        distance_m               BIGINT,
        duration_s               INT,
        idle_time_s              INT,
        avg_speed                INT,
        max_speed                INT,
        fuel_usage               DECIMAL(10,3),
        fueltype                 INT,
        co2                      INT,
        driverno                 VARCHAR(20),
        drivername               VARCHAR(255),
        optidrive_indicator      DECIMAL(5,2),
        speeding_indicator       DECIMAL(5,2),
        drivingevents_indicator  DECIMAL(5,2),
        created_at               TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_trips_objectno_start ON webfleet_trips (objectno, start_time);
      CREATE INDEX IF NOT EXISTS idx_trips_start_time ON webfleet_trips (start_time);

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
    `);
    console.log('[DB] Tables Webfleet créées avec succès');
  } catch (err) {
    console.error('[DB] Erreur création tables Webfleet:', err.message);
  } finally {
    client.release();
  }
}

module.exports = { runWebfleetMigrations };

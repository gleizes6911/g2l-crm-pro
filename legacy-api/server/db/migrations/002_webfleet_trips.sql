-- Webfleet — historique trajets
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
  created_at               TIMESTAMPTZ    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_objectno_start ON webfleet_trips (objectno, start_time);
CREATE INDEX IF NOT EXISTS idx_trips_start_time     ON webfleet_trips (start_time);

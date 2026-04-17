-- Webfleet.flotte — positions véhicules (sync API + queue)
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
  updated_at     TIMESTAMPTZ    DEFAULT NOW()
);

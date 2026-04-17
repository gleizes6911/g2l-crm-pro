/**
 * Jobs planifiés Webfleet : positions, trajets, queue.
 * @module server/jobs/webfleetSync
 */

const cron = require('node-cron');
const { pool } = require('../../services/database');
const { getWebfleetClient, logger: wfLogger } = require('../services/webfleet/webfleetClient');
const { VehicleService } = require('../services/webfleet/vehicleService');
const { TripService } = require('../services/webfleet/tripService');
const { QueueService } = require('../services/webfleet/queueService');
const { AlertService } = require('../services/webfleet/alertService');
/** @type {boolean} */
let queuePollingEnabled = false;

/** @type {boolean} */
let jobsStarted = false;

const vehicleService = new VehicleService();
const tripService = new TripService();
const queueService = new QueueService();
const alertService = new AlertService();

const INSERT_TRIP_COLUMNS = [
  'tripid',
  'objectno',
  'objectname',
  'objectuid',
  'tripmode',
  'start_time',
  'end_time',
  'start_odometer',
  'end_odometer',
  'start_lat',
  'start_lng',
  'end_lat',
  'end_lng',
  'start_postext',
  'end_postext',
  'distance_m',
  'duration_s',
  'idle_time_s',
  'avg_speed',
  'max_speed',
  'fuel_usage',
  'fueltype',
  'co2',
  'driverno',
  'drivername',
  'optidrive_indicator',
  'speeding_indicator',
  'drivingevents_indicator',
];
const INSERT_TRIP_SQL = `
  INSERT INTO webfleet_trips (
    ${INSERT_TRIP_COLUMNS.join(', ')}
  ) VALUES (
    $1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
  )
  ON CONFLICT (tripid) DO NOTHING
  RETURNING tripid
`;
let didLogFirstNormalizedTrip = false;

/**
 * Parse "dd/MM/yyyy HH:mm:ss" en ISO8601.
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
function parseWebfleetDateForInsert(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return s;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss)
  );
  if (Number.isNaN(d.getTime())) return s;
  return d.toISOString();
}

/**
 * Convertit une coordonnée en degrés décimaux.
 * Si valeur > 180, on considère des microdegrés.
 * @param {number|null|undefined} v
 * @returns {number|null}
 */
function normalizeCoord(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 180 ? n / 1_000_000 : n;
}

/**
 * Insère un trajet si absent (upsert logique « skip si existe »).
 * @param {import('pg').PoolClient} client
 * @param {object} t — trajet normalisé (tripService)
 * @returns {Promise<boolean>} true si une ligne a été insérée
 */
async function insertTripIfMissing(client, t) {
  const tid = t.tripid;
  if (tid == null) return false;
  const normalized = {
    ...t,
    start_time: parseWebfleetDateForInsert(t.start_time),
    end_time: parseWebfleetDateForInsert(t.end_time),
    start_lat: normalizeCoord(t.start_lat),
    start_lng: normalizeCoord(t.start_lng),
    end_lat: normalizeCoord(t.end_lat),
    end_lng: normalizeCoord(t.end_lng),
  };
  if (!didLogFirstNormalizedTrip) {
    didLogFirstNormalizedTrip = true;
    wfLogger.info('[Webfleet sync] Premier trajet normalisé avant INSERT', {
      tripid: normalized.tripid,
      start_time: normalized.start_time,
      end_time: normalized.end_time,
      start_lat: normalized.start_lat,
      start_lng: normalized.start_lng,
      end_lat: normalized.end_lat,
      end_lng: normalized.end_lng,
    });
  }
  const values = [
    normalized.tripid,
    normalized.objectno,
    normalized.objectname,
    normalized.objectuid,
    normalized.tripmode,
    normalized.start_time,
    normalized.end_time,
    normalized.start_odometer,
    normalized.end_odometer,
    normalized.start_lat,
    normalized.start_lng,
    normalized.end_lat,
    normalized.end_lng,
    normalized.start_postext,
    normalized.end_postext,
    normalized.distance_m,
    normalized.duration_s,
    normalized.idle_time_s,
    normalized.avg_speed,
    normalized.max_speed,
    normalized.fuel_usage,
    normalized.fueltype,
    normalized.co2,
    normalized.driverno,
    normalized.drivername,
    normalized.optidrive_indicator,
    normalized.speeding_indicator,
    normalized.drivingevents_indicator,
  ];
  if (values.length !== INSERT_TRIP_COLUMNS.length) {
    throw new Error(
      `INSERT webfleet_trips invalide: ${values.length} valeurs pour ${INSERT_TRIP_COLUMNS.length} colonnes`
    );
  }
  const ins = await client.query(INSERT_TRIP_SQL, values);
  return ins.rowCount > 0;
}

/**
 * Synchronise des trajets Webfleet pour une plage prédéfinie (Wm1, D0, …) et met à jour trips_replication.
 * @param {string} rangePattern
 * @returns {Promise<{ inserted: number, fetched: number, maxTripId: number }>}
 */
async function upsertTripsFromRange(rangePattern) {
  if (!pool) return { inserted: 0, fetched: 0, maxTripId: 0 };
  const rp = String(rangePattern || '').trim();
  if (!rp) throw new Error('rangePattern requis');
  const trips = await tripService.getTripsByDateRange(rp, undefined, { syncLog: true });
  let maxId = 0;
  let inserted = 0;
  const client = await pool.connect();
  try {
    for (const t of trips) {
      const tid = t.tripid;
      if (tid == null) continue;
      if (tid > maxId) maxId = tid;
      // eslint-disable-next-line no-await-in-loop
      if (await insertTripIfMissing(client, t)) inserted += 1;
    }
    const r = await client.query(
      `SELECT last_value FROM webfleet_sync_state WHERE sync_type = 'trips_replication' LIMIT 1`
    );
    const last = parseInt(String(r.rows[0]?.last_value ?? 0), 10) || 0;
    if (maxId > last) {
      await client.query(
        `UPDATE webfleet_sync_state SET last_value = $1, updated_at = NOW() WHERE sync_type = 'trips_replication'`,
        [maxId]
      );
    }
  } finally {
    client.release();
  }
  wfLogger.info('[Webfleet sync] upsertTripsFromRange — base PostgreSQL', {
    rangePattern: rp,
    fetched: trips.length,
    inserted,
    maxTripId: maxId,
  });
  return { inserted, fetched: trips.length, maxTripId: maxId };
}

/**
 * Active ou désactive le polling queue (API pop/ack).
 * @param {boolean} v
 * @returns {void}
 */
function setWebfleetQueuePollingEnabled(v) {
  queuePollingEnabled = !!v;
}

/**
 * @returns {boolean}
 */
function isWebfleetQueuePollingEnabled() {
  return queuePollingEnabled;
}

/**
 * Upsert des véhicules en base.
 * @param {object[]} vehicles
 * @returns {Promise<number>}
 */
async function upsertVehiclesBatch(vehicles) {
  if (!pool) return 0;
  const client = await pool.connect();
  let n = 0;
  try {
    const sql = `
      INSERT INTO webfleet_vehicles (
        objectno, objectname, objecttype, latitude, longitude, pos_time,
        speed, course, direction, status, ignition, ignition_time, standstill,
        tripmode, odometer, driver, drivername, postext, fuellevel, objectuid, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10,$11,$12::timestamptz,$13,$14,$15,$16,$17,$18,$19,$20,NOW()
      )
      ON CONFLICT (objectno) DO UPDATE SET
        objectname = EXCLUDED.objectname,
        objecttype = EXCLUDED.objecttype,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        pos_time = EXCLUDED.pos_time,
        speed = EXCLUDED.speed,
        course = EXCLUDED.course,
        direction = EXCLUDED.direction,
        status = EXCLUDED.status,
        ignition = EXCLUDED.ignition,
        ignition_time = EXCLUDED.ignition_time,
        standstill = EXCLUDED.standstill,
        tripmode = EXCLUDED.tripmode,
        odometer = EXCLUDED.odometer,
        driver = EXCLUDED.driver,
        drivername = EXCLUDED.drivername,
        postext = EXCLUDED.postext,
        fuellevel = EXCLUDED.fuellevel,
        objectuid = EXCLUDED.objectuid,
        updated_at = NOW()
    `;
    for (const v of vehicles) {
      await client.query(sql, [
        v.objectno,
        v.objectname,
        v.objecttype,
        v.latitude,
        v.longitude,
        v.pos_time || null,
        v.speed,
        v.course,
        v.direction,
        v.status,
        v.ignition,
        v.ignition_time || null,
        v.standstill,
        v.tripmode,
        v.odometer,
        v.driver,
        v.drivername,
        v.postext,
        v.fuellevel,
        v.objectuid,
      ]);
      n += 1;
    }
  } finally {
    client.release();
  }
  return n;
}

/**
 * Applique un message queue à webfleet_vehicles (positions).
 * @param {object} m — message brut API
 * @returns {Promise<void>}
 */
async function applyPositionQueueMessage(m) {
  if (!pool) return;
  const objectno = String(m.objectno ?? m.objectNo ?? '').trim();
  if (!objectno) return;
  const latRaw = m.pos_latitude != null ? Number(m.pos_latitude) : null;
  const lngRaw = m.pos_longitude != null ? Number(m.pos_longitude) : null;
  const lat = latRaw != null && Number.isFinite(latRaw) ? latRaw / 1_000_000 : null;
  const lng = lngRaw != null && Number.isFinite(lngRaw) ? lngRaw / 1_000_000 : null;
  const postext = m.pos_text != null ? String(m.pos_text) : null;
  const posTime = m.pos_time != null ? String(m.pos_time) : null;
  const ign = m.ign != null ? parseInt(String(m.ign), 10) : null;
  const odo = m.odometer != null ? parseInt(String(m.odometer), 10) : null;
  const tripMode = m.trip_mode != null ? parseInt(String(m.trip_mode), 10) : null;

  await pool.query(
    `
    INSERT INTO webfleet_vehicles (
      objectno, latitude, longitude, postext, pos_time, ignition, odometer, tripmode, updated_at
    ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7,$8,NOW())
    ON CONFLICT (objectno) DO UPDATE SET
      latitude = COALESCE(EXCLUDED.latitude, webfleet_vehicles.latitude),
      longitude = COALESCE(EXCLUDED.longitude, webfleet_vehicles.longitude),
      postext = COALESCE(EXCLUDED.postext, webfleet_vehicles.postext),
      pos_time = COALESCE(EXCLUDED.pos_time, webfleet_vehicles.pos_time),
      ignition = COALESCE(EXCLUDED.ignition, webfleet_vehicles.ignition),
      odometer = COALESCE(EXCLUDED.odometer, webfleet_vehicles.odometer),
      tripmode = COALESCE(EXCLUDED.tripmode, webfleet_vehicles.tripmode),
      updated_at = NOW()
    `,
    [objectno, lat, lng, postext, posTime, ign, odo, tripMode]
  );
}

/**
 * Démarre les tâches cron Webfleet (idempotent).
 * @returns {void}
 */
function startWebfleetCronJobs() {
  if (jobsStarted) return;
  jobsStarted = true;
  if (!pool) {
    // eslint-disable-next-line no-console
    console.warn('[Webfleet cron] Pas de DATABASE_URL — jobs désactivés');
    return;
  }
  if (!getWebfleetClient().isConfigured()) {
    // eslint-disable-next-line no-console
    console.warn('[Webfleet cron] Variables WEBFLEET_* manquantes — jobs désactivés');
    return;
  }

  /** 11 s — sous le plafond 6 req/min */
  setInterval(async () => {
    try {
      const list = await vehicleService.getAllVehicles();
      const n = await upsertVehiclesBatch(list);
      // eslint-disable-next-line no-console
      console.log(`[Webfleet sync] Positions: ${n} véhicule(s) mis à jour — ${new Date().toISOString()}`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Webfleet sync] Positions:', e.message);
    }
  }, 11000);

  /** 2 min — plafond 1 req/min trajets */
  cron.schedule('*/2 * * * *', async () => {
    try {
      if (!pool) return;
      const r = await pool.query(
        `SELECT last_value FROM webfleet_sync_state WHERE sync_type = 'trips_replication' LIMIT 1`
      );
      const last = parseInt(String(r.rows[0]?.last_value ?? 0), 10) || 0;
      let trips;
      if (last === 0) {
        // eslint-disable-next-line no-console
        console.log(
          '[Webfleet sync] Trajets: last_value=0 — bootstrap en 2 appels (w-1 puis w0)'
        );
        const prevWeek = await tripService.getTripsByDateRangeRawMinimal('w-1', { syncLog: true });
        // eslint-disable-next-line no-console
        console.log(
          `[Webfleet sync] Trajets w-1 brut (500): ${String(prevWeek.rawBody || '').slice(0, 500)}`
        );
        const currentWeek = await tripService.getTripsByDateRangeRawMinimal('w0', { syncLog: true });
        // eslint-disable-next-line no-console
        console.log(
          `[Webfleet sync] Trajets w0 brut (500): ${String(currentWeek.rawBody || '').slice(0, 500)}`
        );
        // Fusion + déduplication sur tripid, puis réplication continue au prochain cron via last_value.
        const byTripId = new Map();
        for (const t of [...prevWeek.trips, ...currentWeek.trips]) {
          if (t?.tripid == null) continue;
          byTripId.set(Number(t.tripid), t);
        }
        trips = [...byTripId.values()];
        // eslint-disable-next-line no-console
        console.log(
          `[Webfleet sync] Bootstrap trajets: ${prevWeek.trips.length} (w-1) + ${currentWeek.trips.length} (w0) => ${trips.length} unique(s)`
        );
      } else {
        trips = await tripService.getTripsSince(last);
      }
      let maxId = last;
      let inserted = 0;
      const syncClient = await pool.connect();
      try {
        for (const t of trips) {
          const tid = t.tripid;
          if (tid == null) continue;
          if (tid > maxId) maxId = tid;
          // eslint-disable-next-line no-await-in-loop
          if (await insertTripIfMissing(syncClient, t)) inserted += 1;
        }
      } finally {
        syncClient.release();
      }
      if (maxId > last) {
        await pool.query(
          `UPDATE webfleet_sync_state SET last_value = $1, updated_at = NOW() WHERE sync_type = 'trips_replication'`,
          [maxId]
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        `[Webfleet sync] Trajets: ${inserted} nouveau(x), tripid max ${maxId} — ${new Date().toISOString()}`
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Webfleet sync] Trajets:', e.message);
    }
  });

  /** 7 s — sous 10 req/min pop */
  setInterval(async () => {
    if (!queuePollingEnabled) return;
    try {
      await queueService.ensureQueue();
      const result = await queueService.popAndAck(async (messages) => {
        for (const m of messages) {
          const type = String(m.msg_type ?? m.msgtype ?? '').toLowerCase();
          if (!type || type.includes('pos') || m.pos_latitude != null) {
            await applyPositionQueueMessage(m);
          }
        }
      });
      if (result.count > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[Webfleet sync] Queue: ${result.count} message(s), ${result.acked} acquitté(s) — ${new Date().toISOString()}`
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Webfleet sync] Queue:', e.message);
    }
  }, 7000);

  /** 30 s — vérification alertes Webfleet */
  setInterval(async () => {
    try {
      const result = await alertService.checkAllAlerts();
      if ((result?.created || 0) > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[Webfleet alerts] ${result.created} alerte(s) créée(s) — ${JSON.stringify(
            result.byType || {}
          )}`
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Webfleet alerts] checkAllAlerts:', e.message);
    }
  }, 30000);

  // eslint-disable-next-line no-console
  console.log(
    '[Webfleet cron] Jobs démarrés (positions 11s, trajets 2min, queue 7s si activée, alertes 30s)'
  );
}

module.exports = {
  startWebfleetCronJobs,
  setWebfleetQueuePollingEnabled,
  isWebfleetQueuePollingEnabled,
  upsertVehiclesBatch,
  upsertTripsFromRange,
  vehicleService,
  tripService,
  queueService,
};

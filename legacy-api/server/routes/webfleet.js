/**
 * Routes API Webfleet
 * @module server/routes/webfleet
 */

const express = require('express');
const axios = require('axios');
const { pool } = require('../../services/database');
const { getWebfleetClient, logger: wfLogger } = require('../services/webfleet/webfleetClient');
const { VehicleService } = require('../services/webfleet/vehicleService');
const {
  TripService,
  buildDateRangeParams,
  normalizeRangePattern,
} = require('../services/webfleet/tripService');
const { QueueService } = require('../services/webfleet/queueService');
const {
  upsertVehiclesBatch,
  upsertTripsFromRange,
  setWebfleetQueuePollingEnabled,
  vehicleService: cronVehicleService,
} = require('../jobs/webfleetSync');

const router = express.Router();
const vehicleService = new VehicleService();
const tripService = new TripService();
const queueService = new QueueService();

/** Fuseau pour agrégats « jour » (aligné sur les conducteurs FR). */
const PARIS_TZ = 'Europe/Paris';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEBFLEET_EXTERN_URL = 'https://csv.webfleet.com/extern';

/**
 * @param {string|null|undefined} iso
 * @returns {string} YYYY-MM-DD
 */
function tripStartDateParis(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: PARIS_TZ });
  } catch {
    return '';
  }
}

/**
 * @param {object[]} trips
 * @param {{ objectno: string|null, start: string|null, end: string|null }} filt
 */
function filterNormalizedTrips(trips, filt) {
  let list = trips.slice();
  if (filt.objectno) {
    const id = filt.objectno;
    list = list.filter((t) => String(t.objectno || '').trim() === id);
  }
  if (filt.start && DATE_ONLY_RE.test(filt.start)) {
    list = list.filter((t) => tripStartDateParis(t.start_time) >= filt.start);
  }
  if (filt.end && DATE_ONLY_RE.test(filt.end)) {
    list = list.filter((t) => tripStartDateParis(t.start_time) <= filt.end);
  }
  list.sort((a, b) => {
    const tb = new Date(b.start_time || 0).getTime();
    const ta = new Date(a.start_time || 0).getTime();
    if (tb !== ta) return tb - ta;
    return (Number(b.tripid) || 0) - (Number(a.tripid) || 0);
  });
  return list;
}

/**
 * Diagnostic : appelle showTripReportExtern avec range_pattern=w0, timeout court,
 * et renvoie le brut (1000 caractères) avant tout parsing métier.
 * @see GET /api/webfleet/debug/trips
 */
router.get('/debug/trips', async (req, res) => {
  try {
    const client = getWebfleetClient();
    if (!client.isConfigured()) {
      return res.status(503).json({ error: 'Webfleet non configuré' });
    }
    const sameInstanceAsCronPositions = Boolean(
      cronVehicleService && cronVehicleService.client && cronVehicleService.client === client
    );
    wfLogger.info('[Webfleet debug] /debug/trips credentials et instance', {
      sameInstanceAsCronPositions,
      debugClientInstanceId: client.instanceId || null,
      cronClientInstanceId: cronVehicleService?.client?.instanceId || null,
      ...client.getAuthDebugSnapshot(),
      action: 'showTripReportExtern',
      requestedRangePattern: 'w0',
      params: buildDateRangeParams('w0', undefined, false),
    });
    const raw = await client.getRawText(
      'showTripReportExtern',
      buildDateRangeParams('w0', undefined, false),
      { timeout: 8000, maxRetries: 0, omitUseISO8601: true }
    );
    const rawPreview = String(raw.body || '').slice(0, 1000);
    wfLogger.info('[Webfleet debug] /debug/trips réponse brute (1000 car.)', {
      preview1000: rawPreview,
    });
    res.setHeader('X-Webfleet-Upstream-Status', String(raw.status));
    return res.status(200).json({
      ok: true,
      upstreamStatus: raw.status,
      xWebfleetHeaders: {
        errorCode: raw.headers?.['x-webfleet-errorcode'] || null,
        errorMessage: raw.headers?.['x-webfleet-errormessage'] || null,
      },
      rawPreview1000: rawPreview,
    });
  } catch (e) {
    const isTimeout = e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || ''));
    if (isTimeout) {
      return res.status(504).json({
        error: 'Timeout Webfleet (> 8s) sur /api/webfleet/debug/trips',
        details: e.message,
      });
    }
    res.status(500).json({ error: e.message });
  }
});

/**
 * Diagnostic brut sans webfleetClient : appel axios direct sur Webfleet.
 * @see GET /api/webfleet/debug/raw
 */
router.get('/debug/raw', async (req, res) => {
  try {
    const apikey = process.env.WEBFLEET_API_KEY || '';
    const username = process.env.WEBFLEET_USERNAME || '';
    const password = process.env.WEBFLEET_PASSWORD || '';
    const authBasic = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay(); // 0=dimanche
    const offsetToMonday = (day + 6) % 7;
    monday.setDate(monday.getDate() - offsetToMonday);
    monday.setHours(0, 0, 0, 0);
    const fmt = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return (
        `${d.getFullYear()}` +
        `${pad(d.getMonth() + 1)}` +
        `${pad(d.getDate())}` +
        `${pad(d.getHours())}` +
        `${pad(d.getMinutes())}` +
        `${pad(d.getSeconds())}`
      );
    };
    const rangefrom = fmt(monday);
    const rangeto = fmt(now);
    const params = {
      account: 'transport-Vxq',
      apikey,
      action: 'showTripReportExtern',
      rangefrom,
      rangeto,
      outputformat: 'json',
      useUTF8: 'true',
      lang: 'en',
    };
    const upstream = await axios.get(WEBFLEET_EXTERN_URL, {
      params,
      headers: { Authorization: authBasic },
      timeout: 8000,
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    const rawBody =
      typeof upstream.data === 'string'
        ? upstream.data
        : upstream.data != null
          ? String(upstream.data)
          : '';
    return res.status(200).json({
      ok: true,
      status: upstream.status,
      xWebfleetHeaders: {
        errorCode: upstream.headers?.['x-webfleet-errorcode'] || null,
        errorMessage: upstream.headers?.['x-webfleet-errormessage'] || null,
      },
      rawPreview2000: rawBody.slice(0, 2000),
    });
  } catch (e) {
    const isTimeout = e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || ''));
    if (isTimeout) {
      return res.status(504).json({
        error: 'Timeout Webfleet (> 8s) sur /api/webfleet/debug/raw',
        details: e.message,
      });
    }
    return res.status(500).json({ error: e.message });
  }
});

/** Km parcourus aujourd’hui : trajets dont le départ est aujourd’hui (Europe/Paris), somme distance_m. Fallback API d0 si aucun en base. */
router.get('/stats/today-km', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée', km: 0 });
    const r = await pool.query(
      `
      SELECT
        COALESCE(SUM(distance_m), 0)::double precision AS meters,
        COUNT(*)::int AS n
      FROM webfleet_trips
      WHERE (start_time AT TIME ZONE $1)::date = (NOW() AT TIME ZONE $1)::date
      `,
      [PARIS_TZ]
    );
    let meters = Number(r.rows[0]?.meters || 0);
    const nToday = Number(r.rows[0]?.n || 0);
    let source = 'db';

    if (nToday === 0 && getWebfleetClient().isConfigured()) {
      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: PARIS_TZ });
      const apiTrips = await tripService.getTripsByDateRange('d0');
      const todayTrips = apiTrips.filter((t) => tripStartDateParis(t.start_time) === todayStr);
      meters = todayTrips.reduce((s, t) => s + (Number(t.distance_m) || 0), 0);
      source = 'api_d0';
    }

    res.json({ meters, km: meters / 1000, source });
  } catch (e) {
    res.status(500).json({ error: e.message, km: 0 });
  }
});

/**
 * Sérialise une ligne véhicule DB en objet JSON API.
 * @param {object} row
 * @returns {object}
 */
function rowToVehicle(row) {
  if (!row) return null;
  return {
    objectno: row.objectno,
    objectname: row.objectname,
    objecttype: row.objecttype,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    pos_time: row.pos_time,
    speed: row.speed,
    course: row.course,
    direction: row.direction,
    status: row.status,
    ignition: row.ignition,
    ignition_time: row.ignition_time,
    standstill: row.standstill,
    tripmode: row.tripmode,
    odometer: row.odometer != null ? Number(row.odometer) : null,
    /** km — odometer API en unités 100 m */
    odometer_km: row.odometer != null ? Number(row.odometer) / 10 : null,
    driver: row.driver,
    drivername: row.drivername,
    postext: row.postext,
    fuellevel: row.fuellevel,
    /** % — pour mille / 10 */
    fuellevel_pct: row.fuellevel != null ? Number(row.fuellevel) / 10 : null,
    objectuid: row.objectuid,
    updated_at: row.updated_at,
  };
}

/**
 * @param {object} row
 * @returns {object}
 */
function rowToTrip(row) {
  if (!row) return null;
  const dm = row.distance_m != null ? Number(row.distance_m) : null;
  return {
    tripid: row.tripid != null ? String(row.tripid) : null,
    objectno: row.objectno,
    objectname: row.objectname,
    objectuid: row.objectuid,
    tripmode: row.tripmode,
    start_time: row.start_time,
    end_time: row.end_time,
    start_odometer: row.start_odometer,
    end_odometer: row.end_odometer,
    start_lat: row.start_lat,
    start_lng: row.start_lng,
    end_lat: row.end_lat,
    end_lng: row.end_lng,
    start_postext: row.start_postext,
    end_postext: row.end_postext,
    distance_m: dm,
    distance_km: dm != null ? dm / 1000 : null,
    duration_s: row.duration_s != null ? Number(row.duration_s) : null,
    idle_time_s: row.idle_time_s != null ? Number(row.idle_time_s) : null,
    avg_speed: row.avg_speed,
    max_speed: row.max_speed,
    fuel_usage: row.fuel_usage != null ? Number(row.fuel_usage) : null,
    fueltype: row.fueltype,
    co2: row.co2,
    driverno: row.driverno,
    drivername: row.drivername,
    optidrive_indicator: row.optidrive_indicator,
    speeding_indicator: row.speeding_indicator,
    drivingevents_indicator: row.drivingevents_indicator,
    created_at: row.created_at,
  };
}

/** Liste tous les véhicules (PostgreSQL) */
router.get('/vehicles', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const r = await pool.query(
      `SELECT * FROM webfleet_vehicles ORDER BY objectname NULLS LAST, objectno`
    );
    res.json({ data: r.rows.map(rowToVehicle) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Rafraîchissement depuis l’API Webfleet + upsert */
router.get('/vehicles/refresh', async (req, res) => {
  try {
    const list = await vehicleService.getAllVehicles();
    const n = await upsertVehiclesBatch(list);
    res.json({ ok: true, updated: n });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Un véhicule */
router.get('/vehicles/:objectno', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const id = String(req.params.objectno || '').trim();
    const r = await pool.query(`SELECT * FROM webfleet_vehicles WHERE objectno = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Véhicule introuvable' });
    res.json(rowToVehicle(r.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Véhicule Webfleet par immatriculation (objectname). */
router.get('/vehicle-by-name/:immatriculation', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const immat = String(req.params.immatriculation || '');
    if (!immat) return res.status(400).json({ error: 'immatriculation invalide' });

    const r = await pool.query(
      `
      SELECT *
      FROM webfleet_vehicles
      WHERE UPPER(objectname) = UPPER($1)
      LIMIT 1
      `,
      [immat]
    );
    if (!r.rows.length) {
      return res.json({ found: false });
    }
    return res.json({ found: true, data: rowToVehicle(r.rows[0]) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Trajets Webfleet par immatriculation et date Paris. */
router.get('/trips-by-name/:immatriculation', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const immat = String(req.params.immatriculation || '');
    if (!immat) return res.status(400).json({ error: 'immatriculation invalide' });
    const dateRaw = String(req.query.date || '').trim();
    const dateOnly = DATE_ONLY_RE.test(dateRaw)
      ? dateRaw
      : new Date().toLocaleDateString('en-CA', { timeZone: PARIS_TZ });

    const vr = await pool.query(
      `
      SELECT objectno
      FROM webfleet_vehicles
      WHERE UPPER(objectname) = UPPER($1)
      LIMIT 1
      `,
      [immat]
    );
    if (!vr.rows.length) {
      return res.json({
        found: false,
        date: dateOnly,
        data: [],
        summary: {
          count: 0,
          distance_m: 0,
          duration_s: 0,
          fuel_usage: 0,
          co2: 0,
        },
      });
    }
    const objectno = String(vr.rows[0].objectno || '');
    const tr = await pool.query(
      `
      SELECT *
      FROM webfleet_trips
      WHERE objectno = $1
        AND (start_time AT TIME ZONE 'Europe/Paris')::date = $2::date
      ORDER BY start_time ASC
      `,
      [objectno, dateOnly]
    );
    const rows = tr.rows.map(rowToTrip);
    const summary = rows.reduce(
      (acc, t) => {
        acc.count += 1;
        acc.distance_m += Number(t.distance_m) || 0;
        acc.duration_s += Number(t.duration_s) || 0;
        acc.fuel_usage += Number(t.fuel_usage) || 0;
        acc.co2 += Number(t.co2) || 0;
        return acc;
      },
      { count: 0, distance_m: 0, duration_s: 0, fuel_usage: 0, co2: 0 }
    );
    return res.json({
      found: true,
      objectno,
      date: dateOnly,
      data: rows,
      summary,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Liste paginée des trajets (dates « jour » interprétées en Europe/Paris). Si aucun résultat en base, fallback showTripReportExtern d0. */
router.get('/trips', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 25), 10) || 25));
    const offset = (page - 1) * limit;
    const objectno = req.query.objectno ? String(req.query.objectno).trim() : null;
    const start = req.query.start ? String(req.query.start).trim() : null;
    const end = req.query.end ? String(req.query.end).trim() : null;

    const conds = [];
    const vals = [];
    let i = 1;
    const tzSql = `'${PARIS_TZ.replace(/'/g, "''")}'`;

    if (objectno) {
      conds.push(`objectno = $${i++}`);
      vals.push(objectno);
    }
    if (start) {
      if (DATE_ONLY_RE.test(start)) {
        conds.push(`(start_time AT TIME ZONE ${tzSql})::date >= $${i++}::date`);
        vals.push(start);
      } else {
        conds.push(`start_time >= $${i++}::timestamptz`);
        vals.push(start);
      }
    }
    if (end) {
      if (DATE_ONLY_RE.test(end)) {
        conds.push(`(start_time AT TIME ZONE ${tzSql})::date <= $${i++}::date`);
        vals.push(end);
      } else {
        conds.push(`start_time <= $${i++}::timestamptz`);
        vals.push(end);
      }
    }

    const whereMid = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*)::int AS n FROM webfleet_trips ${whereMid}`;
    const limPh = i++;
    const offPh = i++;
    const listSql = `SELECT * FROM webfleet_trips ${whereMid} ORDER BY start_time DESC NULLS LAST, tripid DESC LIMIT $${limPh} OFFSET $${offPh}`;

    const cnt = await pool.query(countSql, vals);
    let total = cnt.rows[0]?.n ?? 0;
    const limParam = limit;
    const offParam = offset;
    let rows = [];
    if (total > 0) {
      const q = await pool.query(listSql, [...vals, limParam, offParam]);
      rows = q.rows;
    }

    let source = 'db';
    const emptyCheck = await pool.query(
      `SELECT NOT EXISTS (SELECT 1 FROM webfleet_trips LIMIT 1) AS is_empty`
    );
    const tripsTableEmpty = emptyCheck.rows[0]?.is_empty === true;

    if (total === 0 && tripsTableEmpty && getWebfleetClient().isConfigured()) {
      const apiTrips = await tripService.getTripsByDateRange('d0');
      const filtered = filterNormalizedTrips(apiTrips, { objectno, start, end });
      total = filtered.length;
      const slice = filtered.slice(offset, offset + limit);
      rows = slice.map((t) => ({
        ...t,
        created_at: null,
      }));
      source = 'api_d0';
    }

    res.json({
      data: rows.map(rowToTrip),
      page,
      limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit) || 1,
      source,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Synchronisation immédiate des trajets (semaine dernière wm1) vers webfleet_trips. */
router.get('/trips/sync', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    if (!getWebfleetClient().isConfigured()) {
      return res.status(503).json({ error: 'Webfleet non configuré' });
    }
    const pattern = normalizeRangePattern(req.query.range ? String(req.query.range).trim() : 'wm1');
    const result = await upsertTripsFromRange(pattern);
    res.json({ ok: true, range_pattern: pattern, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Trajets d’un véhicule (date=YYYY-MM-DD en Europe/Paris ; sinon 7 derniers jours) */
router.get('/trips/vehicle/:objectno', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const id = String(req.params.objectno || '').trim();
    const date = req.query.date ? String(req.query.date).trim() : null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : null;
    let r;
    if (dateOnly) {
      r = await pool.query(
        `
        SELECT *
        FROM webfleet_trips
        WHERE objectno = $1
          AND (start_time AT TIME ZONE 'Europe/Paris')::date = $2::date
        ORDER BY start_time ASC NULLS LAST, tripid ASC
        `,
        [id, dateOnly]
      );
    } else {
      r = await pool.query(
        `
        SELECT *
        FROM webfleet_trips
        WHERE objectno = $1
          AND start_time >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
        ORDER BY start_time DESC NULLS LAST, tripid DESC
        LIMIT 1000
        `,
        [id]
      );
    }
    res.json({ data: r.rows.map(rowToTrip) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Détail trajet */
router.get('/trips/:tripid', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const tid = parseInt(String(req.params.tripid), 10);
    if (!Number.isFinite(tid)) return res.status(400).json({ error: 'tripid invalide' });
    const r = await pool.query(`SELECT * FROM webfleet_trips WHERE tripid = $1`, [tid]);
    if (!r.rows.length) return res.status(404).json({ error: 'Trajet introuvable' });
    res.json(rowToTrip(r.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Liste alertes Webfleet avec filtres + résumé. */
router.get('/alerts', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const type = req.query.type ? String(req.query.type).trim() : null;
    const objectno = req.query.objectno ? String(req.query.objectno).trim() : null;
    const acknowledged =
      req.query.acknowledged == null ? null : String(req.query.acknowledged).trim().toLowerCase();
    const dateRaw = req.query.date ? String(req.query.date).trim() : null;
    const dateOnly = DATE_ONLY_RE.test(dateRaw || '') ? dateRaw : null;
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));

    const conds = [];
    const vals = [];
    let i = 1;
    if (type) {
      conds.push(`alert_type = $${i++}`);
      vals.push(type);
    }
    if (objectno) {
      conds.push(`objectno = $${i++}`);
      vals.push(objectno);
    }
    if (acknowledged === 'true' || acknowledged === 'false') {
      conds.push(`acknowledged = $${i++}`);
      vals.push(acknowledged === 'true');
    }
    if (dateOnly) {
      conds.push(`(msg_time AT TIME ZONE 'Europe/Paris')::date = $${i++}::date`);
      vals.push(dateOnly);
    }
    const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const list = await pool.query(
      `
      SELECT *
      FROM webfleet_alerts
      ${whereSql}
      ORDER BY msg_time DESC, id DESC
      LIMIT $${i}
      `,
      [...vals, limit]
    );
    const summary = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COALESCE(SUM(CASE WHEN alert_type = 'speeding' THEN 1 ELSE 0 END),0)::int AS speeding,
        COALESCE(SUM(CASE WHEN alert_type = 'idling' THEN 1 ELSE 0 END),0)::int AS idling,
        COALESCE(SUM(CASE WHEN alert_type = 'low_fuel' THEN 1 ELSE 0 END),0)::int AS low_fuel,
        COALESCE(SUM(CASE WHEN alert_type = 'malfunction' THEN 1 ELSE 0 END),0)::int AS malfunction
      FROM webfleet_alerts
      ${whereSql}
      `,
      vals
    );
    const s = summary.rows[0] || {};
    return res.json({
      data: list.rows,
      summary: {
        total: Number(s.total || 0),
        byType: {
          speeding: Number(s.speeding || 0),
          idling: Number(s.idling || 0),
          low_fuel: Number(s.low_fuel || 0),
          malfunction: Number(s.malfunction || 0),
        },
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Alertes non acquittées du jour (Paris), groupées par type. */
router.get('/alerts/today', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const list = await pool.query(
      `
      SELECT *
      FROM webfleet_alerts
      WHERE acknowledged = false
        AND (msg_time AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date
      ORDER BY msg_time DESC, id DESC
      `
    );
    const g = await pool.query(
      `
      SELECT alert_type, COUNT(*)::int AS n
      FROM webfleet_alerts
      WHERE acknowledged = false
        AND (msg_time AT TIME ZONE 'Europe/Paris')::date = (NOW() AT TIME ZONE 'Europe/Paris')::date
      GROUP BY alert_type
      `
    );
    const grouped = { speeding: 0, idling: 0, low_fuel: 0, malfunction: 0 };
    for (const r of g.rows) {
      grouped[String(r.alert_type)] = Number(r.n || 0);
    }
    return res.json({ data: list.rows, grouped });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Acquitte une alerte. */
router.patch('/alerts/:id/acknowledge', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
    const q = await pool.query(
      `
      UPDATE webfleet_alerts
      SET acknowledged = true
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );
    if (!q.rows.length) return res.status(404).json({ error: 'Alerte introuvable' });
    return res.json({ ok: true, data: q.rows[0] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Acquitte toutes les alertes non acquittées. */
router.post('/alerts/acknowledge-all', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Base de données non configurée' });
    const q = await pool.query(
      `
      UPDATE webfleet_alerts
      SET acknowledged = true
      WHERE acknowledged = false
      RETURNING id
      `
    );
    return res.json({ ok: true, updated: q.rowCount || 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Démarre polling queue + ensure queue */
router.post('/queue/start', async (req, res) => {
  try {
    await queueService.ensureQueue();
    queueService.registerShutdownHook();
    setWebfleetQueuePollingEnabled(true);
    res.json({ ok: true, polling: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Arrête polling + deleteQueueExtern */
router.post('/queue/stop', async (req, res) => {
  try {
    setWebfleetQueuePollingEnabled(false);
    await queueService.deleteQueueExtern(0);
    res.json({ ok: true, polling: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** État module */
router.get('/status', async (req, res) => {
  try {
    const client = getWebfleetClient();
    const configured = client.isConfigured();
    let queueActive = false;
    let vehicleCount = 0;
    let lastVehicleSync = null;
    let lastTripSync = null;
    if (pool) {
      const st = await pool.query(
        `SELECT queue_active FROM webfleet_queue_state WHERE queue_name = 'positions_default' LIMIT 1`
      );
      queueActive = st.rows[0]?.queue_active === true;
      const vc = await pool.query(`SELECT COUNT(*)::int AS n, MAX(updated_at) AS m FROM webfleet_vehicles`);
      vehicleCount = vc.rows[0]?.n ?? 0;
      lastVehicleSync = vc.rows[0]?.m;
      const tr = await pool.query(`SELECT MAX(created_at) AS m, MAX(start_time) AS s FROM webfleet_trips`);
      lastTripSync = tr.rows[0]?.m;
    }
    res.json({
      apiConfigured: configured,
      connected: configured && Boolean(pool),
      queueActive,
      queuePolling: require('../jobs/webfleetSync').isWebfleetQueuePollingEnabled(),
      vehicleCount,
      lastVehicleSync,
      lastTripSync,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

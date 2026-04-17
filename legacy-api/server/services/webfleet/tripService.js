/**
 * Service trajets Webfleet (showTripReportExtern)
 * @module server/services/webfleet/tripService
 */

const { getWebfleetClient, extractRows, logger } = require('./webfleetClient');

/** Timeout court + pas de retry pour éviter les blocages sur showTripReportExtern. */
const TRIP_REPORT_HTTP = { timeout: 15000, maxRetries: 0 };

const TRIP_COLUMNS = [
  'tripid',
  'tripmode',
  'objectno',
  'objectname',
  'objectuid',
  'start_time',
  'end_time',
  'start_odometer',
  'end_odometer',
  'distance',
  'duration',
  'idle_time',
  'avg_speed',
  'max_speed',
  'fuel_usage',
  'co2',
  'fueltype',
  'start_postext',
  'end_postext',
  'start_latitude',
  'start_longitude',
  'end_latitude',
  'end_longitude',
  'driverno',
  'drivername',
  'optidrive_indicator',
  'speeding_indicator',
  'drivingevents_indicator',
].join(',');

// Webfleet peut renvoyer end_time ou endTime selon version JSON
function pickEndTime(raw) {
  return raw.end_time ?? raw.endTime ?? null;
}

/**
 * Convertit une date Webfleet en ISO8601.
 * - Conserve tel quel si déjà ISO
 * - Convertit dd/MM/yyyy HH:mm:ss en ISO
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function toIsoDateTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );
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
 * Formate des secondes en HH:MM:SS
 * @param {number} totalSec
 * @returns {string}
 */
function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Normalise un trajet Webfleet.
 * @param {Record<string, *>} raw
 * @returns {object}
 */
function normalizeTrip(raw) {
  const distM = raw.distance != null ? parseInt(String(raw.distance), 10) : null;
  const dur = raw.duration != null ? parseInt(String(raw.duration), 10) : null;
  const idle = raw.idle_time != null ? parseInt(String(raw.idle_time), 10) : null;

  const sla = raw.start_latitude != null ? Number(raw.start_latitude) : null;
  const slo = raw.start_longitude != null ? Number(raw.start_longitude) : null;
  const ela = raw.end_latitude != null ? Number(raw.end_latitude) : null;
  const elo = raw.end_longitude != null ? Number(raw.end_longitude) : null;

  return {
    tripid: raw.tripid != null ? parseInt(String(raw.tripid), 10) : null,
    tripmode: raw.tripmode != null ? parseInt(String(raw.tripmode), 10) : null,
    objectno: raw.objectno != null ? String(raw.objectno) : null,
    objectname: raw.objectname != null ? String(raw.objectname) : null,
    objectuid: raw.objectuid != null ? String(raw.objectuid) : null,
    start_time: toIsoDateTime(raw.start_time != null ? String(raw.start_time) : null),
    end_time: toIsoDateTime(pickEndTime(raw) != null ? String(pickEndTime(raw)) : null),
    start_odometer: raw.start_odometer != null ? parseInt(String(raw.start_odometer), 10) : null,
    end_odometer: raw.end_odometer != null ? parseInt(String(raw.end_odometer), 10) : null,
    start_lat: sla != null && Number.isFinite(sla) ? sla / 1_000_000 : null,
    start_lng: slo != null && Number.isFinite(slo) ? slo / 1_000_000 : null,
    end_lat: ela != null && Number.isFinite(ela) ? ela / 1_000_000 : null,
    end_lng: elo != null && Number.isFinite(elo) ? elo / 1_000_000 : null,
    start_postext: raw.start_postext != null ? String(raw.start_postext) : null,
    end_postext: raw.end_postext != null ? String(raw.end_postext) : null,
    distance_m: distM,
    distance_km: distM != null && Number.isFinite(distM) ? distM / 1000 : null,
    duration_s: dur,
    duration_formatted: dur != null ? formatDuration(dur) : null,
    idle_time_s: idle,
    idle_formatted: idle != null ? formatDuration(idle) : null,
    avg_speed: raw.avg_speed != null ? parseInt(String(raw.avg_speed), 10) : null,
    max_speed: raw.max_speed != null ? parseInt(String(raw.max_speed), 10) : null,
    fuel_usage: raw.fuel_usage != null ? parseFloat(String(raw.fuel_usage)) : null,
    fueltype: raw.fueltype != null ? parseInt(String(raw.fueltype), 10) : null,
    co2: raw.co2 != null ? parseInt(String(raw.co2), 10) : null,
    driverno: raw.driverno != null ? String(raw.driverno) : null,
    drivername: raw.drivername != null ? String(raw.drivername) : null,
    optidrive_indicator:
      raw.optidrive_indicator != null ? parseFloat(String(raw.optidrive_indicator)) : null,
    speeding_indicator:
      raw.speeding_indicator != null ? parseFloat(String(raw.speeding_indicator)) : null,
    drivingevents_indicator:
      raw.drivingevents_indicator != null
        ? parseFloat(String(raw.drivingevents_indicator))
        : null,
  };
}

/** @type {string[]} — plages couvrant plus d’un mois sans objectno interdit */
const LONG_RANGE = new Set(['y0']);

/**
 * Normalise les alias de plages vers les valeurs Webfleet validées.
 * @param {string} rangePattern
 * @returns {string}
 */
function normalizeRangePattern(rangePattern) {
  const rp = String(rangePattern || '').trim().toLowerCase();
  if (rp === 'wm1') return 'w-1';
  if (rp === 'mm1') return 'm-1';
  return rp;
}

/**
 * Construit les paramètres showTripReportExtern pour une plage.
 * IMPORTANT: showTripReportExtern attend ici range_pattern (minuscules).
 * @param {string} rangePattern
 * @param {string|undefined} objectno
 * @param {boolean} withColumnFilter
 * @returns {Record<string, string>}
 */
function buildDateRangeParams(rangePattern, objectno, withColumnFilter = true) {
  const rp = normalizeRangePattern(rangePattern);
  const allowed = new Set(['d0', 'w0', 'w-1', 'm-1', 'ud', 'y0']);
  if (!allowed.has(rp)) {
    throw new Error(`Plage "${rp}" non prise en charge (attendu: d0, w0, w-1, m-1, ud, y0).`);
  }
  const base = { range_pattern: rp, ...(objectno ? { objectno: String(objectno) } : {}) };
  if (!withColumnFilter) return base;
  return { columnfilter: TRIP_COLUMNS, ...base };
}

class TripService {
  constructor() {
    this.client = getWebfleetClient();
  }

  /**
   * @param {*} data
   * @returns {object[]}
   * @private
   */
  _rows(data) {
    if (Array.isArray(data)) return data;
    return extractRows(data);
  }

  /**
   * Réplication : trajets avec tripid strictement supérieur.
   * @param {number} tripid
   * @param {{ http?: { timeout?: number, maxRetries?: number } }} [options]
   * @returns {Promise<object[]>}
   */
  async getTripsSince(tripid, options = {}) {
    const last = Math.max(0, parseInt(String(tripid), 10) || 0);
    const http = { ...TRIP_REPORT_HTTP, omitUseISO8601: true, ...options.http };
    const params = {
      columnfilter: TRIP_COLUMNS,
      tripid: last,
    };
    const data = await this.client.get('showTripReportExtern', params, http);
    return this._rows(data).map((r) => normalizeTrip(r)).filter((t) => t.tripid != null);
  }

  /**
   * Téléchargement par plage prédéfinie (D0, Dm1, W0, …).
   * @param {string} rangePattern
   * @param {string} [objectno] - obligatoire si plage > 1 mois
   * @param {{ syncLog?: boolean, http?: { timeout?: number, maxRetries?: number } }} [options]
   * @returns {Promise<object[]>}
   */
  async getTripsByDateRange(rangePattern, objectno, options = {}) {
    const rp = normalizeRangePattern(rangePattern);
    if (LONG_RANGE.has(rp) && !objectno) {
      throw new Error(
        'Pour une plage supérieure à un mois (ex. Y0), objectno est obligatoire côté Webfleet.'
      );
    }
    const http = { ...TRIP_REPORT_HTTP, omitUseISO8601: true, ...options.http };
    const params = buildDateRangeParams(rp, objectno, true);
    if (options.syncLog) {
      logger.info('[Webfleet sync] showTripReportExtern — paramètres envoyés', {
        action: 'showTripReportExtern',
        params,
        objectno: objectno ? String(objectno) : null,
        timeoutMs: http.timeout,
        maxRetries: http.maxRetries,
        omitUseISO8601: http.omitUseISO8601 === true,
      });
    }
    const data = await this.client.get('showTripReportExtern', params, http);
    const rows = this._rows(data);
    if (options.syncLog) {
      let preview;
      if (data === null || data === undefined) {
        preview = '(null/undefined)';
      } else if (typeof data === 'string') {
        preview = data.slice(0, 8000);
      } else {
        try {
          preview = JSON.stringify(data).slice(0, 8000);
        } catch {
          preview = String(data).slice(0, 8000);
        }
      }
      logger.info('[Webfleet sync] showTripReportExtern — réponse brute (extrait, max 8000 car.)', {
        preview,
      });
      logger.info('[Webfleet sync] showTripReportExtern — lignes extraites avant normalisation', {
        rowCount: rows.length,
      });
    }
    const normalized = rows.map((r) => normalizeTrip(r)).filter((t) => t.tripid != null);
    if (options.syncLog) {
      logger.info('[Webfleet sync] showTripReportExtern — trajets valides (tripid présent)', {
        tripCount: normalized.length,
      });
    }
    return normalized;
  }

  /**
   * Appel minimal de showTripReportExtern sans columnfilter (diagnostic / bootstrap).
   * @param {string} rangePattern
   * @param {{ syncLog?: boolean, http?: { timeout?: number, maxRetries?: number } }} [options]
   * @returns {Promise<{ rawBody: string, rows: object[], trips: object[] }>}
   */
  async getTripsByDateRangeRawMinimal(rangePattern, options = {}) {
    const rp = normalizeRangePattern(rangePattern);
    const http = { ...TRIP_REPORT_HTTP, omitUseISO8601: true, ...options.http };
    const params = buildDateRangeParams(rp, undefined, false);
    const raw = await this.client.getRawText('showTripReportExtern', params, http);
    const rawBody = String(raw.body || '');
    if (options.syncLog) {
      logger.info('[Webfleet sync] showTripReportExtern minimal — réponse brute (500 car.)', {
        preview500: rawBody.slice(0, 500),
        params,
      });
    }
    let parsed = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = null;
    }
    const rows = extractRows(parsed);
    const trips = rows.map((r) => normalizeTrip(r)).filter((t) => t.tripid != null);
    return { rawBody, rows, trips };
  }

  /**
   * Trajets d’un véhicule pour une plage.
   * @param {string} objectno
   * @param {string} rangePattern
   * @returns {Promise<object[]>}
   */
  async getTripsByObject(objectno, rangePattern) {
    return this.getTripsByDateRange(rangePattern, objectno);
  }
}

module.exports = {
  TripService,
  normalizeTrip,
  formatDuration,
  TRIP_COLUMNS,
  TRIP_REPORT_HTTP,
  buildDateRangeParams,
  normalizeRangePattern,
  toIsoDateTime,
};

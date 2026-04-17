/**
 * Service véhicules Webfleet (showObjectReportExtern)
 * @module server/services/webfleet/vehicleService
 */

const { getWebfleetClient, extractRows } = require('./webfleetClient');

const COLUMNFILTER = [
  'objectno',
  'objectname',
  'objecttype',
  'longitude_mdeg',
  'latitude_mdeg',
  'pos_time',
  'speed',
  'course',
  'direction',
  'status',
  'ignition',
  'ignition_time',
  'standstill',
  'tripmode',
  'odometer',
  'driver',
  'drivername',
  'objectuid',
  'postext',
  'fuellevel',
].join(',');

/**
 * Normalise un enregistrement objet Webfleet pour usage applicatif / DB.
 * @param {Record<string, *>} raw
 * @returns {object}
 */
function normalizeVehicle(raw) {
  const latMd = Number(raw.latitude_mdeg ?? raw.latitude ?? 0);
  const lngMd = Number(raw.longitude_mdeg ?? raw.longitude ?? 0);
  const lat = Number.isFinite(latMd) ? latMd / 1_000_000 : null;
  const lng = Number.isFinite(lngMd) ? lngMd / 1_000_000 : null;

  return {
    objectno: String(raw.objectno ?? '').trim(),
    objectname: raw.objectname != null ? String(raw.objectname) : null,
    objecttype: raw.objecttype != null ? String(raw.objecttype) : null,
    latitude: lat,
    longitude: lng,
    pos_time: raw.pos_time != null ? String(raw.pos_time) : null,
    speed: raw.speed != null ? parseInt(String(raw.speed), 10) : null,
    course: raw.course != null ? parseInt(String(raw.course), 10) : null,
    direction: raw.direction != null ? parseInt(String(raw.direction), 10) : null,
    /** @type {string|null} A=ok, V=imprécis, L=dernière connue, 0=invalide */
    status: raw.status != null ? String(raw.status).charAt(0) : null,
    ignition: raw.ignition != null ? parseInt(String(raw.ignition), 10) : null,
    ignition_time: raw.ignition_time != null ? String(raw.ignition_time) : null,
    standstill: raw.standstill != null ? parseInt(String(raw.standstill), 10) : null,
    tripmode: raw.tripmode != null ? parseInt(String(raw.tripmode), 10) : null,
    odometer: raw.odometer != null ? parseInt(String(raw.odometer), 10) : null,
    driver: raw.driver != null ? String(raw.driver) : null,
    drivername: raw.drivername != null ? String(raw.drivername) : null,
    postext: raw.postext != null ? String(raw.postext) : null,
    fuellevel: raw.fuellevel != null ? parseInt(String(raw.fuellevel), 10) : null,
    objectuid: raw.objectuid != null ? String(raw.objectuid) : null,
  };
}

class VehicleService {
  constructor() {
    this.client = getWebfleetClient();
  }

  /**
   * Liste tous les véhicules (positions / état) via l’API.
   * @returns {Promise<object[]>}
   */
  async getAllVehicles() {
    const data = await this.client.get('showObjectReportExtern', {
      columnfilter: COLUMNFILTER,
    });
    const rows = Array.isArray(data) ? data : extractRows(data);
    return rows.map((r) => normalizeVehicle(r)).filter((v) => v.objectno);
  }

  /**
   * Détail d’un véhicule par objectno.
   * @param {string} objectno
   * @returns {Promise<object|null>}
   */
  async getVehicleById(objectno) {
    const all = await this.getAllVehicles();
    const id = String(objectno || '').trim();
    return all.find((v) => v.objectno === id) || null;
  }
}

module.exports = { VehicleService, normalizeVehicle, COLUMNFILTER };

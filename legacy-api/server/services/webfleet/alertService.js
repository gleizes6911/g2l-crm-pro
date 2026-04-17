/**
 * Détection et création d'alertes Webfleet.
 * @module server/services/webfleet/alertService
 */

const { pool } = require('../../../services/database');

const ALERT_TYPES = {
  SPEEDING: 'speeding',
  IDLING: 'idling',
  LOW_FUEL: 'low_fuel',
  MALFUNCTION: 'malfunction',
};

class AlertService {
  constructor() {
    this.speedThreshold = Number(process.env.WEBFLEET_ALERT_SPEED_KMH || 130);
    this.lowFuelThresholdPct = Number(process.env.WEBFLEET_ALERT_LOW_FUEL_PCT || 15);
  }

  isAvailable() {
    return Boolean(pool);
  }

  async checkAndCreateAlert(type, objectno, payload, minIntervalSeconds) {
    if (!this.isAvailable()) return false;
    if (!type || !objectno) return false;

    const intervalSqlByType = {
      [ALERT_TYPES.SPEEDING]: "INTERVAL '5 minutes'",
      [ALERT_TYPES.IDLING]: "INTERVAL '1 hour'",
      [ALERT_TYPES.LOW_FUEL]: "INTERVAL '6 hours'",
      [ALERT_TYPES.MALFUNCTION]: "INTERVAL '2 hours'",
    };
    const intervalSql =
      intervalSqlByType[String(type)] ||
      `(${String(Math.max(0, Number(minIntervalSeconds) || 0))} * INTERVAL '1 second')`;
    const recent = await pool.query(
      `
      SELECT id
      FROM webfleet_alerts
      WHERE objectno = $1
        AND alert_type = $2
        AND created_at > NOW() - ${intervalSql}
      LIMIT 1
      `,
      [String(objectno), String(type)]
    );
    // eslint-disable-next-line no-console
    console.log('[Webfleet alerts] anti-spam check', {
      objectno: String(objectno),
      type: String(type),
      window: intervalSql,
      blocked: recent.rowCount > 0,
    });
    if (recent.rowCount > 0) return false;

    const msgTime = payload.msg_time || payload.pos_time || new Date().toISOString();
    const insert = await pool.query(
      `
      INSERT INTO webfleet_alerts (
        alert_type, objectno, objectname, drivername, msg_time, msg_text, speed,
        pos_latitude, pos_longitude, pos_text, raw_msgid, acknowledged
      ) VALUES (
        $1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,$11,false
      )
      RETURNING *
      `,
      [
        String(type),
        String(objectno),
        payload.objectname || null,
        payload.drivername || null,
        msgTime,
        payload.msg_text || null,
        payload.speed != null ? Number(payload.speed) : null,
        payload.pos_latitude != null ? Number(payload.pos_latitude) : null,
        payload.pos_longitude != null ? Number(payload.pos_longitude) : null,
        payload.pos_text || null,
        payload.raw_msgid != null ? Number(payload.raw_msgid) : null,
      ]
    );
    if (!insert.rows[0]) return false;

    return true;
  }

  async checkAllAlerts() {
    if (!this.isAvailable()) return { created: 0, byType: {} };
    const q = await pool.query(`SELECT * FROM webfleet_vehicles`);
    const vehicles = q.rows || [];
    const byType = {
      [ALERT_TYPES.SPEEDING]: 0,
      [ALERT_TYPES.IDLING]: 0,
      [ALERT_TYPES.LOW_FUEL]: 0,
      [ALERT_TYPES.MALFUNCTION]: 0,
    };

    for (const v of vehicles) {
      const objectno = String(v.objectno || '').trim();
      if (!objectno) continue;
      const objectname = v.objectname || objectno;
      const drivername = v.drivername || null;
      const pos_time = v.pos_time || null;
      const pos_latitude = v.latitude != null ? Number(v.latitude) : null;
      const pos_longitude = v.longitude != null ? Number(v.longitude) : null;
      const pos_text = v.postext || null;

      const speed = Number(v.speed || 0);
      const ignition = Number(v.ignition || 0);
      const standstill = Number(v.standstill || 0);
      const fuellevelPct =
        v.fuellevel != null && Number.isFinite(Number(v.fuellevel))
          ? Number(v.fuellevel) / 10
          : null;

      if (speed > this.speedThreshold && ignition === 1 && standstill === 0) {
        // eslint-disable-next-line no-await-in-loop
        const created = await this.checkAndCreateAlert(
          ALERT_TYPES.SPEEDING,
          objectno,
          {
            objectname,
            drivername,
            msg_time: pos_time,
            msg_text: `Vitesse: ${speed} km/h`,
            speed,
            pos_latitude,
            pos_longitude,
            pos_text,
          },
          5 * 60
        );
        if (created) byType[ALERT_TYPES.SPEEDING] += 1;
      }

      const ignTime = v.ignition_time ? new Date(v.ignition_time) : null;
      const idleDurationMinutes =
        ignTime && !Number.isNaN(ignTime.getTime())
          ? (Date.now() - ignTime.getTime()) / 60000
          : 0;
      if (ignition === 1 && standstill === 1 && idleDurationMinutes > 15) {
        // eslint-disable-next-line no-await-in-loop
        const created = await this.checkAndCreateAlert(
          ALERT_TYPES.IDLING,
          objectno,
          {
            objectname,
            drivername,
            msg_time: pos_time,
            msg_text: `Arrêt moteur allumé: ${Math.round(idleDurationMinutes)} min`,
            speed,
            pos_latitude,
            pos_longitude,
            pos_text,
          },
          60 * 60
        );
        if (created) byType[ALERT_TYPES.IDLING] += 1;
      }

      if (fuellevelPct != null && fuellevelPct < this.lowFuelThresholdPct) {
        // eslint-disable-next-line no-await-in-loop
        const created = await this.checkAndCreateAlert(
          ALERT_TYPES.LOW_FUEL,
          objectno,
          {
            objectname,
            drivername,
            msg_time: pos_time,
            msg_text: `Carburant: ${fuellevelPct.toFixed(1)}%`,
            speed,
            pos_latitude,
            pos_longitude,
            pos_text,
          },
          6 * 60 * 60
        );
        if (created) byType[ALERT_TYPES.LOW_FUEL] += 1;
      }

      const posDate = pos_time ? new Date(pos_time) : null;
      const noSignalMinutes =
        posDate && !Number.isNaN(posDate.getTime())
          ? Math.floor((Date.now() - posDate.getTime()) / 60000)
          : Number.POSITIVE_INFINITY;
      const statusFlag = String(v.status || '').toUpperCase();
      const ignitionRecent =
        ignTime && !Number.isNaN(ignTime.getTime())
          ? Date.now() - ignTime.getTime() < 6 * 60 * 60 * 1000
          : false;
      if (statusFlag === 'V' || (ignition === 1 && ignitionRecent && noSignalMinutes > 120)) {
        const signalText =
          statusFlag === 'V'
            ? 'GPS imprécis (status V)'
            : `Pas de signal depuis ${Math.floor(noSignalMinutes / 60)}h${String(
                noSignalMinutes % 60
              ).padStart(2, '0')}`;
        // eslint-disable-next-line no-await-in-loop
        const created = await this.checkAndCreateAlert(
          ALERT_TYPES.MALFUNCTION,
          objectno,
          {
            objectname,
            drivername,
            msg_time: new Date().toISOString(),
            msg_text: signalText,
            speed,
            pos_latitude,
            pos_longitude,
            pos_text,
          },
          2 * 60 * 60
        );
        if (created) byType[ALERT_TYPES.MALFUNCTION] += 1;
      }
    }

    const created = Object.values(byType).reduce((s, n) => s + n, 0);
    return { created, byType };
  }
}

module.exports = {
  AlertService,
  ALERT_TYPES,
};

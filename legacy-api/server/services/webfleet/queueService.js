/**
 * Queue temps réel Webfleet (create / pop / ack / delete)
 * Pop et ack sérialisés — acquittement obligatoire après chaque pop.
 * @module server/services/webfleet/queueService
 */

const Bottleneck = require('bottleneck');
const { getWebfleetClient, extractRows } = require('./webfleetClient');
const { pool } = require('../../../services/database');

const QUEUE_NAME = 'positions_default';
const MSG_CLASS = 0;

/** Sérialise toute la chaîne pop → traitement → ack */
const queueSerial = new Bottleneck({ maxConcurrent: 1 });

/**
 * Met à jour updated_at pour l’entrée de queue.
 * @param {string} queueName
 * @returns {Promise<void>}
 */
async function touchQueueRow(queueName) {
  if (!pool) return;
  await pool.query(
    `UPDATE webfleet_queue_state SET updated_at = NOW() WHERE queue_name = $1`,
    [queueName]
  );
}

class QueueService {
  constructor() {
    this.client = getWebfleetClient();
    /** @type {boolean} */
    this._shutdownHookRegistered = false;
  }

  /**
   * Enregistre SIGTERM pour suppression propre de la queue.
   * @returns {void}
   */
  registerShutdownHook() {
    if (this._shutdownHookRegistered) return;
    this._shutdownHookRegistered = true;
    process.once('SIGTERM', async () => {
      try {
        await this.deleteQueueExtern(MSG_CLASS);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[Webfleet queue] deleteQueueExtern au shutdown:', e.message);
      }
    });
  }

  /**
   * Vérifie en base si la queue est déjà marquée active — évite createQueueExtern inutile.
   * @returns {Promise<boolean>}
   */
  async isQueueActiveInDb() {
    if (!pool) return false;
    const r = await pool.query(
      `SELECT queue_active FROM webfleet_queue_state WHERE queue_name = $1 LIMIT 1`,
      [QUEUE_NAME]
    );
    return r.rows[0]?.queue_active === true;
  }

  /**
   * Persiste l’état « queue active ».
   * @param {boolean} active
   * @returns {Promise<void>}
   */
  async setQueueActiveInDb(active) {
    if (!pool) return;
    await pool.query(
      `
      INSERT INTO webfleet_queue_state (queue_name, msgclass, queue_active, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (queue_name) DO UPDATE SET
        queue_active = EXCLUDED.queue_active,
        msgclass = EXCLUDED.msgclass,
        updated_at = NOW()
      `,
      [QUEUE_NAME, MSG_CLASS, active]
    );
  }

  /**
   * Met à jour le dernier msgid acquitté.
   * @param {number|string} msgid
   * @returns {Promise<void>}
   */
  async persistLastAckedMsgId(msgid) {
    if (!pool) return;
    const v = parseInt(String(msgid), 10) || 0;
    await pool.query(
      `
      INSERT INTO webfleet_queue_state (queue_name, msgclass, last_acked_msgid, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (queue_name) DO UPDATE SET
        last_acked_msgid = GREATEST(webfleet_queue_state.last_acked_msgid, EXCLUDED.last_acked_msgid),
        updated_at = NOW()
      `,
      [QUEUE_NAME, MSG_CLASS, v]
    );
  }

  /**
   * Crée la file si nécessaire (msgclass=0).
   * @returns {Promise<void>}
   */
  async ensureQueue() {
    if (!this.client.isConfigured()) {
      throw new Error('Webfleet non configuré');
    }
    const already = await this.isQueueActiveInDb();
    if (already) {
      await touchQueueRow(QUEUE_NAME);
      return;
    }
    await this.client.post('createQueueExtern', { msgclass: MSG_CLASS });
    await this.setQueueActiveInDb(true);
    this.registerShutdownHook();
  }

  /**
   * Récupère jusqu’à 500 messages (API).
   * @returns {Promise<object[]>}
   */
  async popMessagesRaw() {
    const data = await this.client.get('popQueueMessagesExtern', {
      msgclass: MSG_CLASS,
      maxmessages: 500,
    });
    if (Array.isArray(data)) return data;
    return extractRows(data);
  }

  /**
   * Acquitte les messages par identifiants (obligatoire après pop).
   * @param {string[]} msgids
   * @returns {Promise<void>}
   */
  async ackMessages(msgids) {
    if (!msgids.length) return;
    const list = msgids.map((x) => String(x)).join(',');
    await this.client.post('ackQueueMessagesExtern', {
      msgclass: MSG_CLASS,
      msgid: list,
    });
  }

  /**
   * Supprime la queue côté Webfleet et met à jour la base.
   * @param {number} msgclass
   * @returns {Promise<void>}
   */
  async deleteQueueExtern(msgclass = MSG_CLASS) {
    await this.client.post('deleteQueueExtern', { msgclass });
    await this.setQueueActiveInDb(false);
  }

  /**
   * Extrait les champs utiles d’un message de position.
   * @param {object} m
   * @returns {object}
   */
  normalizePositionMessage(m) {
    return {
      msgid: m.msgid,
      msg_time: m.msg_time,
      msg_class: m.msg_class,
      msg_type: m.msg_type,
      objectno: m.objectno != null ? String(m.objectno) : null,
      pos_latitude: m.pos_latitude != null ? Number(m.pos_latitude) : null,
      pos_longitude: m.pos_longitude != null ? Number(m.pos_longitude) : null,
      pos_text: m.pos_text != null ? String(m.pos_text) : null,
      pos_time: m.pos_time != null ? String(m.pos_time) : null,
      ign: m.ign != null ? parseInt(String(m.ign), 10) : null,
      odometer: m.odometer != null ? parseInt(String(m.odometer), 10) : null,
      trip_mode: m.trip_mode != null ? parseInt(String(m.trip_mode), 10) : null,
      driverno: m.driverno != null ? String(m.driverno) : null,
    };
  }

  /**
   * Chaîne pop → ack sérialisée (à appeler depuis le job ; ack même si 0 message).
   * @param {(messages: object[]) => Promise<void>} onMessages — traite les messages métier
   * @returns {Promise<{ count: number, acked: number }>}
   */
  async popAndAck(onMessages) {
    return queueSerial.schedule(async () => {
      const raw = await this.popMessagesRaw();
      const list = Array.isArray(raw) ? raw : [];
      if (onMessages) {
        await onMessages(list);
      }
      const msgids = list
        .map((x) => x.msgid ?? x.msgId)
        .filter((id) => id != null && id !== '')
        .map((id) => String(id));
      if (msgids.length) {
        await this.ackMessages(msgids);
        const maxId = Math.max(...msgids.map((id) => parseInt(id, 10) || 0));
        if (maxId > 0) await this.persistLastAckedMsgId(maxId);
      }
      return { count: list.length, acked: msgids.length };
    });
  }
}

module.exports = {
  QueueService,
  QUEUE_NAME,
  MSG_CLASS,
};

/**
 * Client HTTP bas niveau WEBFLEET.connect (CSV extern) v1.74.0
 * @module server/services/webfleet/webfleetClient
 */

const axios = require('axios');
const Bottleneck = require('bottleneck');
const winston = require('winston');

const BASE_URL = 'https://csv.webfleet.com/extern';

/** @type {winston.Logger} */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: () => new Date().toISOString() }),
    winston.format.printf(({ level, message, ...meta }) => {
      const m = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${new Date().toISOString()} [${level}] ${message}${m}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Crée un limiteur Bottleneck adapté au plafond indiqué (requêtes par fenêtre).
 * @param {number} maxPerMinute - nombre max de requêtes par minute
 * @returns {Bottleneck}
 */
function createPerMinuteLimiter(maxPerMinute) {
  const safe = Math.max(1, maxPerMinute);
  const minTime = Math.ceil(60000 / safe);
  return new Bottleneck({ minTime, maxConcurrent: 1 });
}

/**
 * Limiteur « réservoir » sur 24 h (ex. create/delete queue).
 * @param {number} maxPer24h
 * @returns {Bottleneck}
 */
function createDailyLimiter(maxPer24h) {
  return new Bottleneck({
    maxConcurrent: 1,
    reservoir: maxPer24h,
    reservoirRefreshAmount: maxPer24h,
    reservoirRefreshInterval: 24 * 60 * 60 * 1000,
  });
}

/**
 * @param {string} action - nom de l'action Webfleet (ex. showObjectReportExtern)
 * @returns {Bottleneck}
 */
function createLimiterForAction(action) {
  switch (action) {
    case 'showObjectReportExtern':
      return createPerMinuteLimiter(6);
    case 'showTripReportExtern':
      return createPerMinuteLimiter(1);
    case 'createQueueExtern':
      return createDailyLimiter(10);
    case 'deleteQueueExtern':
      return createDailyLimiter(10);
    case 'popQueueMessagesExtern':
      return createPerMinuteLimiter(10);
    case 'ackQueueMessagesExtern':
      return createPerMinuteLimiter(10);
    default:
      return new Bottleneck({ minTime: 1000, maxConcurrent: 1 });
  }
}

/**
 * Parse une réponse Webfleet : JSON, texte d'erreur « id, description », ou vide.
 * @param {string} text - corps brut
 * @param {import('axios').AxiosResponseHeaders} headers
 * @returns {*}
 */
function parseWebfleetBody(text, headers) {
  const raw = String(text ?? '').trim();
  const errCodeHdr = headers?.['x-webfleet-errorcode'] || headers?.['X-Webfleet-Errorcode'];
  const errMsgHdr = headers?.['x-webfleet-errormessage'] || headers?.['X-Webfleet-Errormessage'];

  if (!raw && !errCodeHdr) {
    return null;
  }

  if (raw && /^[\d]+,\s*/.test(raw)) {
    const firstLine = raw.split(/\r?\n/)[0];
    const m = firstLine.match(/^(\d+),\s*(.*)$/);
    if (m) {
      const code = m[1];
      const desc = (m[2] || '').trim();
      if (code === '63' && /empty/i.test(desc)) {
        return [];
      }
      if (code === '8') {
        logger.warn('Webfleet action not allowed (8)', { desc });
        return [];
      }
      const err = new Error(`Webfleet ${code}: ${desc}`);
      err.webfleetCode = code;
      throw err;
    }
  }

  if (errCodeHdr && String(errCodeHdr) === '63') {
    return [];
  }

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    if (raw.length < 200 && /^[\d]+,/.test(raw)) {
      const m = raw.match(/^(\d+),\s*(.*)$/);
      if (m && m[1] === '63') return [];
    }
    logger.warn('Réponse Webfleet non JSON', { preview: raw.slice(0, 120) });
    return raw;
  }
}

/**
 * Extrait le premier tableau « métier » d'une charge utile JSON Webfleet.
 * @param {*} data
 * @returns {Array<object>}
 */
function extractRows(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      return v;
    }
  }
  if (data.results && Array.isArray(data.results)) return data.results;
  if (data.report && Array.isArray(data.report)) return data.report;
  return [];
}

/**
 * Client singleton WEBFLEET avec Basic Auth, rate limits, retry, circuit breaker.
 */
class WebfleetClient {
  constructor() {
    /** @type {import('axios').AxiosInstance} */
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 30000,
      validateStatus: () => true,
    });

    /** @type {Map<string, Bottleneck>} */
    this.limiters = new Map();

    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;

    this.account = process.env.WEBFLEET_ACCOUNT || '';
    this.apiKey = process.env.WEBFLEET_API_KEY || '';
    this.username = process.env.WEBFLEET_USERNAME || '';
    this.password = process.env.WEBFLEET_PASSWORD || '';

    const base64Token =
      this.username && this.password
        ? Buffer.from(`${this.username}:${this.password}`, 'utf8').toString('base64')
        : '';
    this.authHeader = base64Token ? `Basic ${base64Token}` : null;
    if (this.authHeader) {
      logger.info('Webfleet Authorization header généré', {
        authorizationScheme: 'Basic',
        authorizationTemplate: 'Basic <base64>',
        username: this.username,
        base64TokenLength: base64Token.length,
        passwordMasked: this.password ? '***' : '(vide)',
      });
    }
  }

  /**
   * Snapshot debug des credentials utilisés (sans mot de passe en clair).
   * @returns {{
   *   username: string,
   *   passwordMasked: string,
   *   authorizationHeader: string|null,
   *   base64Token: string,
   *   base64TokenLength: number
   * }}
   */
  getAuthDebugSnapshot() {
    const auth = this.authHeader || null;
    const base64Token = auth && auth.startsWith('Basic ') ? auth.slice(6) : '';
    return {
      username: this.username,
      passwordMasked: this.password ? '***' : '(vide)',
      authorizationHeader: auth,
      base64Token,
      base64TokenLength: base64Token.length,
    };
  }

  /**
   * Indique si les variables minimales sont présentes.
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this.account && this.apiKey && this.authHeader);
  }

  /**
   * @param {string} action
   * @returns {Bottleneck}
   */
  getLimiter(action) {
    if (!this.limiters.has(action)) {
      this.limiters.set(action, createLimiterForAction(action));
    }
    return this.limiters.get(action);
  }

  /**
   * Paramètres communs obligatoires sur chaque requête.
   * @param {Record<string, string|number|boolean|undefined>} extra
   * @returns {Record<string, string>}
   */
  buildParams(extra = {}, options = {}) {
    const base = {
      account: this.account,
      apikey: this.apiKey,
      outputformat: 'json',
      useISO8601: 'true',
      useUTF8: 'true',
      lang: 'en',
    };
    if (options.omitUseISO8601 === true) {
      delete base.useISO8601;
    }
    const out = { ...base };
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === null) continue;
      out[k] = String(v);
    }
    return out;
  }

  /**
   * @param {string} action
   * @param {Record<string, string|number|boolean|undefined>} params
   * @param {{ timeout?: number, maxRetries?: number }} [requestOptions]
   * @returns {Promise<*>}
   */
  async get(action, params = {}, requestOptions = {}) {
    return this._request('GET', action, params, requestOptions);
  }

  /**
   * @param {string} action
   * @param {Record<string, string|number|boolean|undefined>} params
   * @param {{ timeout?: number, maxRetries?: number }} [requestOptions]
   * @returns {Promise<*>}
   */
  async post(action, params = {}, requestOptions = {}) {
    return this._request('POST', action, params, requestOptions);
  }

  /**
   * Réponse HTTP brute (corps texte non parsé) — diagnostic / debug.
   * @param {string} action
   * @param {Record<string, string|number|boolean|undefined>} params
   * @param {{ timeout?: number }} [requestOptions]
   * @returns {Promise<{ status: number, headers: object, body: string }>}
   */
  async getRawText(action, params = {}, requestOptions = {}) {
    if (!this.isConfigured()) {
      throw new Error('Webfleet non configuré (WEBFLEET_ACCOUNT, API_KEY, USERNAME, PASSWORD)');
    }
    if (Date.now() < this.circuitOpenUntil) {
      throw new Error('Circuit Webfleet ouvert (pause 5 min après erreurs répétées)');
    }
    const limiter = this.getLimiter(action);
    const merged = this.buildParams({ ...params, action }, requestOptions);
    const timeout = requestOptions.timeout ?? 15000;
    return limiter.schedule(async () => {
      const res = await this.http.request({
        method: 'GET',
        url: '',
        params: merged,
        headers: { Authorization: this.authHeader },
        timeout,
        responseType: 'text',
        transformResponse: [(data) => data],
        validateStatus: () => true,
      });
      const body =
        typeof res.data === 'string' ? res.data : res.data != null ? String(res.data) : '';
      return { status: res.status, headers: res.headers, body };
    });
  }

  /**
   * Exécute une requête avec limiteur, circuit breaker et retry réseau.
   * @param {'GET'|'POST'} method
   * @param {string} action
   * @param {Record<string, string|number|boolean|undefined>} params
   * @param {{ timeout?: number, maxRetries?: number }} [requestOptions]
   * @returns {Promise<*>}
   * @private
   */
  async _request(method, action, params, requestOptions = {}) {
    if (!this.isConfigured()) {
      throw new Error('Webfleet non configuré (WEBFLEET_ACCOUNT, API_KEY, USERNAME, PASSWORD)');
    }
    if (Date.now() < this.circuitOpenUntil) {
      throw new Error('Circuit Webfleet ouvert (pause 5 min après erreurs répétées)');
    }

    const limiter = this.getLimiter(action);
    const merged = this.buildParams({ ...params, action }, requestOptions);

    return limiter.schedule(() =>
      this._executeWithRetry(method, action, merged, requestOptions)
    );
  }

  /**
   * @param {'GET'|'POST'} method
   * @param {string} action
   * @param {Record<string, string>} merged - déjà avec action + defaults
   * @param {{ timeout?: number, maxRetries?: number }} [requestOptions]
   * @returns {Promise<*>}
   * @private
   */
  async _executeWithRetry(method, action, merged, requestOptions = {}) {
    const delays = [1000, 2000, 4000];
    let lastErr;
    const reqTimeout =
      requestOptions.timeout !== undefined ? requestOptions.timeout : this.http.defaults.timeout;
    const maxAttempts =
      requestOptions.maxRetries !== undefined ? Math.max(1, requestOptions.maxRetries + 1) : 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const cfg =
          method === 'GET'
            ? {
                method: 'GET',
                url: '',
                params: merged,
                headers: { Authorization: this.authHeader },
                timeout: reqTimeout,
              }
            : {
                method: 'POST',
                url: '',
                data: new URLSearchParams(merged).toString(),
                headers: {
                  Authorization: this.authHeader,
                  'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                },
                timeout: reqTimeout,
              };

        const res = await this.http.request(cfg);
        const durationMs = Date.now() - t0;

        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status} Webfleet`);
        }

        if (res.data != null && typeof res.data === 'object' && !Buffer.isBuffer(res.data)) {
          this.consecutiveFailures = 0;
          logger.info('Webfleet OK', { action, durationMs, status: res.status });
          return res.data;
        }

        let bodyText;
        if (Buffer.isBuffer(res.data)) {
          bodyText = res.data.toString('utf8');
        } else if (typeof res.data === 'string') {
          bodyText = res.data;
        } else if (res.data != null && typeof res.data === 'object') {
          bodyText = JSON.stringify(res.data);
        } else {
          bodyText = '';
        }

        const parsed = parseWebfleetBody(bodyText, res.headers);
        this.consecutiveFailures = 0;
        logger.info('Webfleet OK', { action, durationMs, status: res.status });
        return parsed;
      } catch (err) {
        lastErr = err;
        const durationMs = Date.now() - t0;
        const isNetwork =
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ENOTFOUND' ||
          !err.response;

        if (isNetwork && attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
          continue;
        }

        this.consecutiveFailures += 1;
        if (this.consecutiveFailures >= 5) {
          this.circuitOpenUntil = Date.now() + 5 * 60 * 1000;
          logger.error('Circuit Webfleet: 5 erreurs consécutives, pause 5 min', { action });
          this.consecutiveFailures = 0;
        }
        logger.error('Webfleet erreur', {
          action,
          message: err.message,
          durationMs,
        });
        throw err;
      }
    }
    throw lastErr;
  }
}

const GLOBAL_SINGLETON_KEY = '__mon_premier_projet_webfleet_client_singleton__';
const GLOBAL_SINGLETON_COUNT_KEY = '__mon_premier_projet_webfleet_client_singleton_count__';

/**
 * Instance singleton du client Webfleet.
 * @returns {WebfleetClient}
 */
function getWebfleetClient() {
  if (!globalThis[GLOBAL_SINGLETON_KEY]) {
    globalThis[GLOBAL_SINGLETON_COUNT_KEY] = (globalThis[GLOBAL_SINGLETON_COUNT_KEY] || 0) + 1;
    const c = new WebfleetClient();
    c.instanceId = globalThis[GLOBAL_SINGLETON_COUNT_KEY];
    globalThis[GLOBAL_SINGLETON_KEY] = c;
    logger.info('WebfleetClient singleton initialisé', {
      instanceId: c.instanceId,
      singletonCount: globalThis[GLOBAL_SINGLETON_COUNT_KEY],
    });
  }
  return globalThis[GLOBAL_SINGLETON_KEY];
}

module.exports = {
  WebfleetClient,
  getWebfleetClient,
  extractRows,
  logger: logger.child({ module: 'webfleet' }),
};

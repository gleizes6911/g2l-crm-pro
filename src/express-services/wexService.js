const { readData, writeData, upsertTransactions } = require('./jsonStore');

const BASE_URL = process.env.WEX_BASE_URL || '';
const CLIENT_ID = process.env.WEX_CLIENT_ID || '';
const CLIENT_SECRET = process.env.WEX_CLIENT_SECRET || '';
const USERNAME = process.env.WEX_USERNAME || '';
const PASSWORD = process.env.WEX_PASSWORD || '';
const ACCOUNT_NUMBER = process.env.WEX_ACCOUNT_NUMBER || '';

const API_VERSION = '2.0.0';

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function parseWexDateToISO(value) {
  if (!value) return value;

  // Si c'est déjà un epoch number (ms) : convertir directement
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const s = String(value).trim();

  // Epoch seconds (10 chiffres) / epoch ms (13 chiffres)
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // Format attendu WEX: "DD/MM/YYYY HH:mm:ss"
  const dt = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
  );
  if (dt) {
    const day = Number(dt[1]);
    const month = Number(dt[2]);
    const year = Number(dt[3]);
    const hh = dt[4] != null ? Number(dt[4]) : 0;
    const mm = dt[5] != null ? Number(dt[5]) : 0;
    const ss = dt[6] != null ? Number(dt[6]) : 0;
    const d = new Date(Date.UTC(year, month - 1, day, hh, mm, ss));
    return d.toISOString();
  }

  // Si la date est un timestamp ISO "naïf" (sans timezone) du style:
  // YYYY-MM-DDTHH:mm:ss(.SSS)?
  // alors on le traite comme UTC pour éviter un décalage de jour.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(s)) {
    const d = new Date(`${s}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // Format déjà ISO / timestamp: on laisse passer
  const tryDate = new Date(s);
  if (!Number.isNaN(tryDate.getTime())) return tryDate.toISOString();

  // Sinon on renvoie tel quel (pour ne pas perdre l’info)
  return value;
}

function normalizeProduit(produit) {
  if (!produit) return 'Gasoil';
  const p = String(produit).toLowerCase().trim();
  if (p === 'diesel' || p === 'gazole' || p === 'gasoil') return 'Gasoil';
  if (p === 'adblue' || p === 'ad blue') return 'AdBlue';
  if (p.includes('essence') || p.includes('sp95') || p.includes('sp98')) return 'Essence';
  return String(produit);
}

function normalizeCardNo(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Conserver uniquement les chiffres (les réponses WEX peuvent contenir espaces/tirets).
  const digits = s.replace(/\D/g, '');
  return digits || s;
}

function cardNoCandidates(value) {
  const n = normalizeCardNo(value);
  if (!n) return [];
  const out = [n];
  // Certaines réponses WEX renvoient un suffixe en plus (17+ digits).
  if (/^\d{17,}$/.test(n)) out.push(n.slice(0, 16));
  if (/^\d{16}$/.test(n)) out.push(n.slice(0, 15));
  return Array.from(new Set(out));
}

/** Plaque renseignée sur la fiche carte WEX (à ne pas confondre avec l’embossage). */
function plateFromCardRecord(card) {
  if (!card || typeof card !== 'object') return null;
  const p = String(
    card.vehicle_plate ||
      card.vehiclePlate ||
      card.licensePlate ||
      card.license_plate ||
      card.plate ||
      ''
  ).trim();
  return p || null;
}

/** Embossage / société sur la fiche carte WEX. */
function embossingFromCardRecord(card) {
  if (!card || typeof card !== 'object') return null;
  const e = String(
    card.embossing_name ||
      card.embossingName ||
      card.cardName ||
      card.card_name ||
      card.embossedName ||
      card.embossed_name ||
      ''
  ).trim();
  return e || null;
}

/** Fusionne deux enregistrements carte : ne pas écraser avec undefined / null / chaîne vide. */
function mergeCardRecords(prev, next) {
  const merged = { ...(prev || {}) };
  const nk = next?.card_number || next?.cardNumber || next?.cardNo;
  const pk = merged?.card_number;
  const k = normalizeCardNo(nk || pk || '') || (nk ? String(nk).trim() : null) || (pk ? String(pk).trim() : null);
  if (!k) return merged;
  for (const [key, v] of Object.entries(next || {})) {
    if (key === 'card_number' || key === 'cardNumber' || key === 'cardNo') continue;
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    merged[key] = v;
  }
  merged.card_number = k;
  return merged;
}

/** Aplatit une réponse WEX : carte souvent sous `card`, `data`, `result`, etc. */
function flattenCardSource(raw) {
  if (!raw || typeof raw !== 'object') return {};
  let base = { ...raw };
  const nestedKeys = [
    'card',
    'cardDetail',
    'cardDetails',
    'card_details',
    'fleetCard',
    'fleet_card',
    'data',
    'result',
    'payload',
    'content',
    'body',
    'record',
    'value'
  ];
  for (const key of nestedKeys) {
    const n = raw[key];
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      base = { ...base, ...n };
    }
  }
  return base;
}

/** Valeur affichable pour un statut API (nombre autorisé par WEX). */
function formatWexStatusValue(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  const s = String(v).trim();
  return s || null;
}

/**
 * Libellés carte : Actif / Bloquée / Expirée (remplace « Normal Service », etc.).
 */
function mapWexCardStatusToFrench(raw) {
  if (raw == null || raw === '') return null;
  const s =
    typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : String(raw).trim();
  if (!s) return null;
  const lower = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/^\d+$/.test(lower)) {
    const codeMap = {
      '0': 'Actif',
      '1': 'Actif',
      '2': 'Bloquée',
      '3': 'Expirée',
      '4': 'Bloquée',
      '5': 'Expirée',
      '10': 'Actif',
      '20': 'Bloquée',
      '30': 'Expirée'
    };
    if (codeMap[lower]) return codeMap[lower];
  }

  if (lower.includes('expir')) return 'Expirée';

  if (
    lower.includes('inactive') ||
    lower.includes('inactif') ||
    lower.includes('block') ||
    lower.includes('bloqu') ||
    lower.includes('suspend') ||
    lower.includes('stolen') ||
    lower.includes('perdu') ||
    lower.includes('vol') ||
    lower.includes('fraud') ||
    lower.includes('cancel') ||
    lower.includes('clos') ||
    (lower.includes('temp') && (lower.includes('block') || lower.includes('bloqu'))) ||
    lower.includes('permanent')
  ) {
    return 'Bloquée';
  }

  if (
    lower.includes('normal') ||
    lower.includes('service') ||
    lower.includes('actif') ||
    (lower.includes('active') && !lower.includes('inactive')) ||
    lower.includes('valid') ||
    lower.includes('issue') ||
    lower.includes('open') ||
    lower === 'ok' ||
    lower === 'yes' ||
    lower === 'true'
  ) {
    return 'Actif';
  }

  return s;
}

/** Statut temps réel : affichage lisible. */
function mapOnlineCardStatusToFrench(raw) {
  if (raw == null || raw === '') return null;
  const s = formatWexStatusValue(raw);
  if (!s) return null;
  const lower = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (/^\d+$/.test(lower)) {
    const oMap = { '0': 'Hors ligne', '1': 'En ligne', '2': 'Indéterminé' };
    if (oMap[lower]) return oMap[lower];
  }

  if (
    lower.includes('offline') ||
    lower.includes('hors') ||
    lower.includes('unavailable') ||
    lower === 'false' ||
    lower === 'no' ||
    lower === 'n' ||
    lower === 'non'
  ) {
    return 'Hors ligne';
  }
  if (
    lower.includes('online') ||
    lower.includes('enligne') ||
    (lower.includes('active') && !lower.includes('inactive')) ||
    lower.includes('available') ||
    lower === 'true' ||
    lower === 'yes' ||
    lower === 'y' ||
    lower === 'oui'
  ) {
    return 'En ligne';
  }
  if (lower.includes('unknown') || lower.includes('indeterm') || lower.includes('pend')) {
    return 'Indéterminé';
  }
  return s;
}

const ONLINE_STATUS_KEY_HINT =
  /onlinecard|online.?card|onlinestatus|on_line|on-line|\bonline\b|isonline|is_online|realtime|open.?state|real.?time|livecard|live.?card|realtimestatus|cardonline|pos.?online|authori.*online|issueronline|dsp.*online|nominalonline|connected|connexion|tempsreel|temps.r.el/i;

function deepPickOnlineCardStatus(value, depth = 0, maxDepth = 12) {
  if (value == null || depth > maxDepth) return null;
  if (typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = deepPickOnlineCardStatus(item, depth + 1, maxDepth);
      if (r) return r;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue;
    if (!ONLINE_STATUS_KEY_HINT.test(k)) continue;
    if (typeof v !== 'object' || v instanceof Date) {
      const f = formatWexStatusValue(v);
      if (f) return f;
    } else if (!Array.isArray(v)) {
      const inner =
        v.description ??
        v.label ??
        v.name ??
        v.displayName ??
        v.status ??
        v.state ??
        v.value ??
        v.code ??
        v.key;
      if (inner != null && typeof inner !== 'object') {
        const f = formatWexStatusValue(inner);
        if (f) return f;
      }
      const r = deepPickOnlineCardStatus(v, depth + 1, maxDepth);
      if (r) return r;
    }
  }
  for (const v of Object.values(value)) {
    if (v && typeof v === 'object') {
      const r = deepPickOnlineCardStatus(v, depth + 1, maxDepth);
      if (r) return r;
    }
  }
  return null;
}

function pickOnlineCardStatusRaw(c, rawPayload) {
  const fromFlat =
    formatWexStatusValue(c.onlineCardStatus) ||
    formatWexStatusValue(c.online_card_status) ||
    formatWexStatusValue(c.onLineCardStatus) ||
    formatWexStatusValue(c.realTimeCardStatus) ||
    formatWexStatusValue(c.real_time_card_status) ||
    formatWexStatusValue(c.realtimeCardStatus) ||
    formatWexStatusValue(c.cardOnlineStatus) ||
    formatWexStatusValue(c.card_online_status) ||
    formatWexStatusValue(c.liveCardStatus) ||
    formatWexStatusValue(c.cardRealtimeStatus) ||
    formatWexStatusValue(c.onlineStatus) ||
    formatWexStatusValue(c.online_status) ||
    formatWexStatusValue(c.networkOnlineStatus) ||
    formatWexStatusValue(c.network_online_status) ||
    formatWexStatusValue(c.posOnlineStatus) ||
    formatWexStatusValue(c.authorizationOnlineStatus) ||
    formatWexStatusValue(c.authorization_online_status) ||
    formatWexStatusValue(c.digitalCardStatus) ||
    formatWexStatusValue(c.digital_card_status);
  if (fromFlat) return fromFlat;
  if (rawPayload && typeof rawPayload === 'object') {
    const deep = deepPickOnlineCardStatus(rawPayload);
    if (deep) return deep;
  }
  return null;
}

function pickCardStatus(c) {
  const b = c.blocking || c.cardBlocking || c.card_blocking || {};
  if (typeof c.cardStatus === 'number' && Number.isFinite(c.cardStatus)) return String(c.cardStatus);
  if (typeof c.status === 'number' && Number.isFinite(c.status)) return String(c.status);

  const parts = [
    c.cardStatus,
    c.card_status,
    c.status,
    c.serviceStatus,
    c.service_status,
    c.cardState,
    c.card_state,
    c.lifecycleStatus,
    c.lifecycle_status,
    c.operationalStatus,
    c.operational_status,
    c.activeState,
    c.active_state,
    c.cardActiveState,
    c.card_active_state,
    b.status,
    b.blockingStatus,
    b.blocking_status,
    c.cardBlockingStatus,
    c.card_blocking_status,
    c.statusDescription,
    c.status_description,
    c.cardStatusDescription,
    c.card_status_description
  ];
  for (const p of parts) {
    if (p == null) continue;
    const s = String(p).trim();
    if (s) return s;
  }
  if (typeof c.active === 'boolean') return c.active ? 'Actif' : 'Inactif';
  if (typeof c.isActive === 'boolean') return c.isActive ? 'Actif' : 'Inactif';
  if (typeof c.cardActive === 'boolean') return c.cardActive ? 'Actif' : 'Inactif';
  return null;
}

/** Clés / chemins où WEX (ou intermédiaires) placent souvent l’expiration. */
const EXPIRY_KEY_HINT =
  /expir|exp\.|valid|validite|thru|through|goodthru|enddate|end_date|until|stopdate|serviceto|cardto|mmyy|m\/y|permanentto|echeance|échéance|echéanc/i;

/**
 * Interprète une chaîne brute comme date d’expiration affichable (souvent MM/YYYY).
 */
function parseExpiryFromString(s) {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  t = t.replace(/^exp\.?\s*/i, '').trim();

  const mmyy = t.match(/^(\d{1,2})[\/.\-](\d{2,4})$/);
  if (mmyy) {
    let m = Number(mmyy[1]);
    let y = Number(mmyy[2]);
    if (y >= 0 && y < 100) y += 2000;
    if (m >= 1 && m <= 12 && y >= 1990 && y < 2100) {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  }

  const yyyymmdd = t.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (yyyymmdd) {
    const y = Number(yyyymmdd[1]);
    const m = Number(yyyymmdd[2]);
    const d = Number(yyyymmdd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y < 2100) {
      return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    }
  }

  if (/^\d{4}$/.test(t)) {
    let m = Number(t.slice(0, 2));
    let y = Number(t.slice(2));
    if (y >= 0 && y < 100) y += 2000;
    if (m >= 1 && m <= 12 && y >= 1990 && y < 2100) {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  }

  if (/^\d{6}$/.test(t)) {
    const m = Number(t.slice(0, 2));
    const y = Number(t.slice(2));
    if (m >= 1 && m <= 12 && y >= 1990 && y < 2100) {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  }

  if (/^\d{8}$/.test(t)) {
    const y = Number(t.slice(0, 4));
    const m = Number(t.slice(4, 6));
    if (m >= 1 && m <= 12 && y >= 1990 && y < 2100) {
      return `${String(m).padStart(2, '0')}/${y}`;
    }
  }

  const isoTry = parseWexDateToISO(t);
  if (isoTry && typeof isoTry === 'string' && /^\d{4}-\d{2}-\d{2}/.test(isoTry)) {
    const d = isoTry.slice(0, 10);
    const [y, m, day] = d.split('-');
    return `${m}/${day}/${y}`;
  }

  return t.length <= 32 ? t : null;
}

function parseExpiryFromNumber(n) {
  if (!Number.isFinite(n)) return null;
  if (n > 1e12) {
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  }
  if (n > 1e9 && n < 1e12) {
    const d = new Date(n * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  }
  const int = Math.trunc(Math.abs(n));
  const str = String(int);
  if (str.length === 4) {
    return parseExpiryFromString(str);
  }
  if (str.length === 6) {
    return parseExpiryFromString(str);
  }
  if (str.length === 8) {
    return parseExpiryFromString(str);
  }
  return null;
}

function tryParseExpiryPrimitive(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') return parseExpiryFromNumber(v);
  if (typeof v === 'string') return parseExpiryFromString(v);
  if (typeof v === 'boolean') return null;
  return null;
}

/**
 * Parcourt l’objet API (parfois imbriqué) pour trouver une expiration.
 * Ne parse les primitifs que si le nom de clé ressemble à une date d’expiration
 * (évite de traiter des IDs numériques comme MM/YYYY).
 */
function deepScanExpiry(value, depth = 0, maxDepth = 10) {
  if (value == null || depth > maxDepth) return null;

  if (value instanceof Date) {
    return tryParseExpiryPrimitive(value);
  }

  if (typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const r = deepScanExpiry(item, depth + 1, maxDepth);
      if (r) return r;
    }
    return null;
  }

  const entries = Object.entries(value);
  for (const [k, v] of entries) {
    if (v == null) continue;
    const keyMatch = EXPIRY_KEY_HINT.test(k);
    if (!keyMatch) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const r =
        pickCardExpiryShallowObject(v) || pickCardExpiry(v) || deepScanExpiry(v, depth + 1, maxDepth);
      if (r) return r;
    } else {
      const r = tryParseExpiryPrimitive(v);
      if (r) return r;
    }
  }

  for (const v of Object.values(value)) {
    if (v && typeof v === 'object') {
      const r = deepScanExpiry(v, depth + 1, maxDepth);
      if (r) return r;
    }
  }
  return null;
}

/** Objet déjà “à plat” avec month/year ou champs string connus (sans récursion profonde). */
function pickCardExpiryShallowObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const m = Number(obj.month ?? obj.expiryMonth ?? obj.expiry_month ?? obj.mm ?? obj.MM);
  let y = Number(obj.year ?? obj.expiryYear ?? obj.expiry_year ?? obj.yyyy ?? obj.YYYY ?? obj.yy);
  if (Number.isFinite(m) && Number.isFinite(y)) {
    let y2 = y;
    if (y2 > 0 && y2 < 100) y2 += 2000;
    if (m >= 1 && m <= 12 && y2 >= 1990 && y2 < 2100) {
      return `${String(m).padStart(2, '0')}/${y2}`;
    }
  }
  return null;
}

/**
 * Date d’expiration carte : champs WEX très variables (MM/YYYY, objet {month,year}, epoch, etc.)
 * Retourne une chaîne lisible (souvent MM/YYYY) ou date JJ/MM/AAAA.
 */
function pickCardExpiry(c) {
  const monthRaw =
    c.expiryMonth ??
    c.expiry_month ??
    c.cardExpiryMonth ??
    c.card_expiry_month ??
    c.expirationMonth ??
    c.expiration_month ??
    c.validThruMonth ??
    c.valid_thru_month;
  const yearRaw =
    c.expiryYear ??
    c.expiry_year ??
    c.cardExpiryYear ??
    c.card_expiry_year ??
    c.expirationYear ??
    c.expiration_year ??
    c.validThruYear ??
    c.valid_thru_year;

  let month = monthRaw != null ? Number(monthRaw) : NaN;
  let year = yearRaw != null ? Number(yearRaw) : NaN;
  if (Number.isFinite(month) && Number.isFinite(year)) {
    if (year > 0 && year < 100) year += 2000;
    if (month >= 1 && month <= 12 && year >= 1990 && year < 2100) {
      return `${String(month).padStart(2, '0')}/${year}`;
    }
  }

  const obj =
    c.expiryDate ||
    c.expiry ||
    c.cardExpiry ||
    c.card_expiry ||
    c.expiration ||
    c.validThru;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const shallow = pickCardExpiryShallowObject(obj);
    if (shallow) return shallow;
    const m = Number(obj.month ?? obj.expiryMonth ?? obj.expiry_month);
    let y = Number(obj.year ?? obj.expiryYear ?? obj.expiry_year);
    if (Number.isFinite(m) && Number.isFinite(y)) {
      if (y > 0 && y < 100) y += 2000;
      if (m >= 1 && m <= 12 && y >= 1990 && y < 2100) {
        return `${String(m).padStart(2, '0')}/${y}`;
      }
    }
  }

  const flat =
    c.expiryDate ||
    c.expiry_date ||
    c.expirationDate ||
    c.expiration_date ||
    c.cardExpiryDate ||
    c.card_expiry_date ||
    c.validTo ||
    c.valid_to ||
    c.validThru ||
    c.valid_thru ||
    c.thruDate ||
    c.thru_date ||
    c.endDate ||
    c.end_date ||
    c.goodThroughDate ||
    c.good_through_date ||
    c.reissueExpiryDate ||
    c.reissue_expiry_date ||
    c.serviceValidTo ||
    c.service_valid_to;

  if (flat instanceof Date && !Number.isNaN(flat.getTime())) {
    const m = String(flat.getUTCMonth() + 1).padStart(2, '0');
    const y = flat.getUTCFullYear();
    return `${m}/${y}`;
  }

  if (flat != null && typeof flat !== 'object') {
    return parseExpiryFromString(String(flat));
  }

  return null;
}

/** Dernière étape : pick classique + scan profond sur la réponse brute. */
function resolveCardExpiry(flattenedCard, rawPayload) {
  const a = pickCardExpiry(flattenedCard);
  if (a) return a;
  const b = rawPayload && rawPayload !== flattenedCard ? deepScanExpiry(rawPayload) : null;
  if (b) return b;
  return null;
}

function basicAuthHeader() {
  const v = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  return `Basic ${v}`;
}

async function wexPost(pathname, body, accessToken) {
  if (!BASE_URL) throw new Error('WEX_BASE_URL manquant');
  const url = `${BASE_URL}${pathname}`;

  const headers = {
    'Content-Type': 'application/json',
    'API-Version': API_VERSION
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const msg = json?.message || json?.error || text || `HTTP ${resp.status}`;
    throw new Error(`[WEX] ${pathname} ${resp.status}: ${msg}`);
  }
  return json;
}

async function login() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('WEX_CLIENT_ID / WEX_CLIENT_SECRET manquants');
  if (!USERNAME || !PASSWORD) throw new Error('WEX_USERNAME / WEX_PASSWORD manquants');

  const url = `${BASE_URL}/login`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
      Authorization: basicAuthHeader()
    },
    body: JSON.stringify({
      grant_type: 'password',
      username: USERNAME,
      password: PASSWORD
    })
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = data?.message || data?.error || `HTTP ${resp.status}`;
    throw new Error(`[WEX] login ${resp.status}: ${msg}`);
  }

  const accessToken = data?.access_token || data?.accessToken || data?.token;
  if (!accessToken) throw new Error('[WEX] login: token manquant');

  // Renouvellement “safe” toutes les 55 minutes
  const now = Date.now();
  tokenCache.accessToken = accessToken;
  tokenCache.expiresAt = now + 55 * 60 * 1000;
  return accessToken;
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt) return tokenCache.accessToken;
  return await login();
}

async function searchTransactions(dateFrom, dateTo) {
  const token = await getToken();

  // Format WEX: "DD/MM/YYYY HH:mm:ss"
  function toWexDate(dateStr, endOfDay = false) {
    const [year, month, day] = String(dateStr || '').split('-');
    if (!year || !month || !day) {
      throw new Error(`WEX: date invalide (attendu YYYY-MM-DD): ${dateStr}`);
    }
    const time = endOfDay ? '23:59:59' : '00:00:00';
    return `${day}/${month}/${year} ${time}`;
  }

  const accountNumber = process.env.WEX_ACCOUNT_NUMBER; // "15578014"
  if (!accountNumber) throw new Error('WEX_ACCOUNT_NUMBER manquant');

  const payload = {
    cardNumber: '',
    sEffectiveDateFrom: toWexDate(dateFrom, false),
    sEffectiveDateTo: toWexDate(dateTo, true),
    reference: '',
    locationNos: [],
    driverName: '',
    licensePlate: '',
    costCentres: [],
    acquiringCountries: [],
    productDescription: '',
    merchantNo: '',
    pageRequest: {
      pageNumber: 1,
      pageSize: 100,
      fetchCount: true,
      sortFields: [
        { columnName: 'effective_at', orderType: 'desc' }
      ]
    },
    customerNos: [accountNumber]
  };

  // eslint-disable-next-line no-console
  console.log('[WEX] search-transactions payload:', JSON.stringify(payload, null, 2));

  // Pagination simple si hasMoreTransactions
  const MAX_PAGES = 10;
  let pageNumber = 1;
  let hasMore = true;
  const allTxs = [];
  let lastResp = null;

  while (hasMore && pageNumber <= MAX_PAGES) {
    const payloadPage = {
      ...payload,
      pageRequest: { ...payload.pageRequest, pageNumber }
    };

    // eslint-disable-next-line no-console
    console.log(`[WEX] search-transactions page ${pageNumber}`);

    const response = await fetch(`${BASE_URL}/transaction/search-transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'API-Version': API_VERSION,
        Accept: 'application/json'
      },
      body: JSON.stringify(payloadPage)
    });

    const text = await response.text();
    lastResp = text;

    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(`[WEX] /transaction/search-transactions ${response.status}: ${text}`);
      throw new Error(`WEX search-transactions error ${response.status}: ${text}`);
    }

    const data = text ? JSON.parse(text) : null;
    const transactions = data?.transactionList || [];
    // eslint-disable-next-line no-console
    console.log(
      `[WEX] ✅ ${transactions.length} transactions récupérées (totalRows: ${data?.totalRows || 'n/a'})`
    );
    allTxs.push(...transactions);

    hasMore = Boolean(data?.hasMoreTransactions);
    pageNumber += 1;
  }

  if (lastResp && pageNumber > MAX_PAGES) {
    // eslint-disable-next-line no-console
    console.warn(`[WEX] ⚠️ Pagination interrompue après ${MAX_PAGES} pages.`);
  }

  return allTxs;
}

async function getTransactionDetails(transactionId) {
  const token = await getToken();

  const payload = {
    customerNos: [ACCOUNT_NUMBER],
    transactionId
  };

  const response = await fetch(`${BASE_URL}/transaction/details`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  if (!response.ok) {
    // Ne pas bloquer la synchro si une transaction échoue
    // eslint-disable-next-line no-console
    console.error(`[WEX] /transaction/details ${response.status}: ${text}`);
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getCards() {
  const token = await getToken();

  // 1) API 2.0 : POST /card/details (customerNos) — souvent la voie officielle pour la liste des cartes
  if (ACCOUNT_NUMBER) {
    try {
      const payload = { customerNos: [ACCOUNT_NUMBER] };
      const response = await fetch(`${BASE_URL}/card/details`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'API-Version': API_VERSION,
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error(`[WEX] /card/details ${response.status}: ${text}`);
      } else {
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        const cards = Array.isArray(data)
          ? data
          : data?.cards || data?.cardList || data?.card_details || data?.data || data?.results || [];
        const arr = Array.isArray(cards) ? cards : [];
        if (arr.length > 0) {
          // eslint-disable-next-line no-console
          console.log('[WEX DEBUG] sample card FULL:', JSON.stringify(arr[0], null, 2));
          // eslint-disable-next-line no-console
          console.log('[WEX DEBUG] sample card keys:', Object.keys(arr[0]));
          // eslint-disable-next-line no-console
          console.log('[WEX DEBUG] sample card:', JSON.stringify(arr[0], null, 2));
          // eslint-disable-next-line no-console
          console.log(`[WEX] ✅ ${arr.length} cartes récupérées (/card/details)`);
          return arr;
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[WEX] /card/details échec, fallback search/list:', e?.message || e);
    }
  }

  // 2) Fallback : anciens endpoints paginés / variantes
  const candidates = [
    {
      endpoint: '/card/search-cards',
      body: {
        customerNos: [ACCOUNT_NUMBER],
        pageRequest: { pageNumber: 1, pageSize: 200, fetchCount: true }
      }
    },
    {
      endpoint: '/card/search-cards',
      body: {
        customerNos: [ACCOUNT_NUMBER]
      }
    },
    { endpoint: '/card/list', body: { customerNos: [ACCOUNT_NUMBER] } },
    { endpoint: '/card/list', body: {} }
  ];

  let lastErr = null;
  for (const c of candidates) {
    try {
      const all = [];
      let page = 1;
      const MAX_PAGES = 20;

      while (page <= MAX_PAGES) {
        const body = c.body?.pageRequest
          ? {
              ...c.body,
              pageRequest: { ...c.body.pageRequest, pageNumber: page }
            }
          : c.body;

        const resp = await wexPost(c.endpoint, body, token);
        const cardsPage =
          resp?.cards ||
          resp?.cardList ||
          resp?.card_details ||
          resp?.data ||
          resp?.results ||
          resp?.items ||
          [];

        const arr = Array.isArray(cardsPage) ? cardsPage : [];
        all.push(...arr);

        const hasMore = Boolean(resp?.hasMoreCards || resp?.hasMore || resp?.has_next || resp?.nextPage);
        if (!hasMore || !c.body?.pageRequest || arr.length === 0) break;
        page += 1;
      }

      if (all.length > 0) return all;
      // Si endpoint répond mais sans cartes, on tente la stratégie suivante
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error('WEX: impossible de récupérer les cartes via endpoints de liste');
}

async function getCardVelocityControls(cardNumber) {
  const token = await getToken();
  const payload = {
    customerNos: [ACCOUNT_NUMBER],
    cardNumber: String(cardNumber || '').trim()
  };
  if (!payload.cardNumber) return null;

  const response = await fetch(`${BASE_URL}/card/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error(`[WEX] /card/search ${response.status}: ${text}`);
    return null;
  }

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  const cardDetail = Array.isArray(data)
    ? data[0]
    : data?.cards?.[0] ||
      data?.cardList?.[0] ||
      data?.card ||
      data?.data?.[0] ||
      data?.data ||
      data;

  if (cardDetail && typeof cardDetail === 'object') {
    // eslint-disable-next-line no-console
    console.log('[WEX DEBUG] card/search keys:', Object.keys(cardDetail));
    // eslint-disable-next-line no-console
    console.log(
      '[WEX DEBUG] card/search velocityControls:',
      cardDetail.velocityControls || cardDetail.velocity_controls || 'NON TROUVÉ'
    );
    // eslint-disable-next-line no-console
    console.log('[WEX DEBUG] card/search cardControlProfile:', cardDetail.cardControlProfile || 'NON TROUVÉ');
  }

  return cardDetail && typeof cardDetail === 'object' ? cardDetail : null;
}

async function getCardDefaultProfile(accountNumber, cardProduct) {
  const token = await getToken();
  if (!cardProduct) return null;

  const response = await fetch(`${BASE_URL}/card/order/default-profile`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'API-Version': API_VERSION,
      Accept: 'application/json'
    },
    body: JSON.stringify({
      customerNumber: accountNumber || ACCOUNT_NUMBER,
      cardProductOid: cardProduct
    })
  });

  const text = await response.text();
  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error(`[WEX] /card/order/default-profile ${response.status}: ${text}`);
    return null;
  }

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // eslint-disable-next-line no-console
  console.log('[WEX DEBUG] default-profile:', JSON.stringify(data, null, 2));
  return data;
}

async function getAccount() {
  const token = await getToken();
  const payloads = [
    { accountNumber: ACCOUNT_NUMBER },
    { customerNumber: ACCOUNT_NUMBER },
    { accountNo: ACCOUNT_NUMBER },
    { customerNo: ACCOUNT_NUMBER },
    { searchValue: ACCOUNT_NUMBER },
    { number: ACCOUNT_NUMBER },
    {
      pageRequest: {
        pageNumber: 1,
        pageSize: 10,
        fetchCount: true,
        sortFields: []
      },
      accountNumber: ACCOUNT_NUMBER
    },
    {
      pageRequest: {
        pageNumber: 1,
        pageSize: 10,
        fetchCount: true,
        sortFields: []
      },
      customerNumber: ACCOUNT_NUMBER
    }
  ];

  for (const payload of payloads) {
    try {
      const response = await fetch(`${BASE_URL}/accounts/olssearch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'API-Version': API_VERSION,
          Accept: 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const text = await response.text();

      if (response.ok) {
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        const account = Array.isArray(data) ? data[0] : data?.accounts?.[0] || data;
        // eslint-disable-next-line no-console
        console.log('[WEX] ✅ getAccount OK avec payload:', JSON.stringify(payload));
        // eslint-disable-next-line no-console
        console.log('[WEX DEBUG] account keys:', Object.keys(account || {}));
        // eslint-disable-next-line no-console
        console.log('[WEX DEBUG] account complet:', JSON.stringify(account, null, 2));
        return account || null;
      }

      // eslint-disable-next-line no-console
      console.log(`[WEX] getAccount payload ${JSON.stringify(payload)} → ${response.status}: ${text}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[WEX] getAccount erreur réseau:', err?.message || err);
    }
  }

  // eslint-disable-next-line no-console
  console.error('[WEX] ❌ getAccount : aucun payload ne fonctionne pour /accounts/olssearch');
  return null;
}

function normalizeTx(raw) {
  const tx = raw || {};
  // Il y a souvent 2 notions différentes dans WEX :
  // - transactionId (requis pour /transaction/details)
  // - transactionRef (souvent une référence affichable)
  const transactionId = tx.transactionId || tx.transaction_id || tx.txId || tx.tx_id;

  const transactionRef =
    tx.transactionRef ||
    tx.transaction_ref ||
    tx.transactionReference ||
    tx.reference ||
    tx.txRef ||
    tx.tx_ref ||
    tx.id ||
    transactionId;
  // WEX renvoie souvent la date sur des champs différents (ex: `effective_at`).
  // On essaie plusieurs candidats, puis on fallback sur `transactionRef` si parseable.
  const transactionDateCandidate =
    tx.transactionDate ||
    tx.transaction_date ||
    tx.date ||
    tx.postingDate ||
    tx.posting_date ||
    tx.effective_at ||
    tx.effectiveAt ||
    tx.effectiveDate ||
    tx.effective_at_ts ||
    tx.effectiveAtTs ||
    tx.transactionDateTime ||
    tx.transaction_time ||
    tx.valueDate;

  const transactionDateToParse = transactionDateCandidate || transactionRef;
  const cardNumber =
    tx.cardNumber ||
    tx.card_number ||
    tx.cardNo ||
    tx.card_no ||
    tx.cardId ||
    tx.card_id;
  const vehicle =
    tx.vehicleId ||
    tx.vehicle_id ||
    tx.vehiclePlate ||
    tx.vehicle_plate ||
    tx.plate ||
    tx.immatriculation ||
    tx.licensePlate ||
    tx.license_plate;
  const driverName = tx.driverName || tx.driver_name || tx.driver;
  const siteName = tx.siteName || tx.site_name || tx.merchantName || tx.stationName || tx.locationName || tx.location_name;
  const siteCountry = tx.siteCountry || tx.site_country || tx.country;
  const productTypeRaw = tx.productType || tx.product_type || tx.product || tx.productDescription || tx.product_description;
  const productType = normalizeProduit(productTypeRaw);

  // Champs “fiables” WEX (sinon fuelQuantity/fuelUnitPrice peuvent être à 0)
  const totalTransQuantityRaw =
    tx.totalTransQuantity ?? tx.total_trans_quantity ?? tx.totalQuantity ?? tx.total_quantity ?? tx.fuelQuantity ?? tx.fuel_quantity ?? tx.quantityLiters ?? tx.quantity_liters;
  const customerAmountRaw =
    tx.customerAmount ??
    tx.customer_amount ??
    tx.fuelTransactionValue ??
    tx.fuel_transaction_value ??
    tx.customerTransactionValue ??
    tx.customer_transaction_value ??
    tx.amountTtc ??
    tx.amount_ttc ??
    tx.amount ??
    tx.totalAmount;

  const totalTransQuantity =
    totalTransQuantityRaw != null && Number.isFinite(Number(totalTransQuantityRaw)) ? Number(totalTransQuantityRaw) : null;
  const customerAmount =
    customerAmountRaw != null && Number.isFinite(Number(customerAmountRaw)) ? Number(customerAmountRaw) : null;

  const quantityLiters = totalTransQuantity != null ? totalTransQuantity : (tx.quantityLiters ?? tx.quantity_liters ?? tx.quantity ?? tx.liters);
  const amountTtc = customerAmount != null ? customerAmount : (tx.amountTtc ?? tx.amount_ttc ?? tx.amount ?? tx.totalAmount);
  const unitPrice =
    quantityLiters != null && Number(quantityLiters) > 0 && amountTtc != null
      ? Number(amountTtc) / Number(quantityLiters)
      : (tx.unitPrice ?? tx.unit_price ?? tx.pricePerLiter ?? tx.unitCost);
  const amountHt = tx.amountHt ?? tx.amount_ht;
  const currency = tx.currency || 'EUR';

  return {
    transaction_ref: transactionRef ? String(transactionRef) : undefined,
    transactionId: transactionId ? String(transactionId) : transactionRef ? String(transactionRef) : undefined,
    account_number: tx.accountNumber || tx.account_number || ACCOUNT_NUMBER,
    cardNumber: cardNumber ? String(cardNumber) : undefined,
    card_number: cardNumber ? String(cardNumber) : undefined,
    licensePlate: vehicle ? String(vehicle) : undefined,
    vehicle_id: vehicle ? String(vehicle) : undefined,
    driverName: driverName ? String(driverName) : undefined,
    driver_name: driverName ? String(driverName) : undefined,
    effectiveAt: transactionDateToParse ? parseWexDateToISO(transactionDateToParse) : undefined,
    transaction_date: transactionDateToParse ? parseWexDateToISO(transactionDateToParse) : undefined,
    site_name: siteName ? String(siteName) : undefined,
    locationName: siteName ? String(siteName) : undefined,
    site_country: siteCountry ? String(siteCountry) : undefined,
    product_type: productType ? String(productType) : undefined,
    productDescription: productType ? String(productType) : undefined,
    totalTransQuantity: quantityLiters != null ? Number(quantityLiters) : null,
    quantity_liters: quantityLiters != null ? Number(quantityLiters) : null,
    fuelUnitPrice: unitPrice != null ? Number(unitPrice) : null,
    unit_price: unitPrice != null ? Number(unitPrice) : null,
    amount_ht: amountHt != null ? Number(amountHt) : null,
    customerAmount: amountTtc != null ? Number(amountTtc) : null,
    amount_ttc: amountTtc != null ? Number(amountTtc) : null,
    currency,
    synced_at: new Date().toISOString()
  };
}

function normalizeCard(raw) {
  const c = flattenCardSource(raw);
  const cardStatusExplicit = formatWexStatusValue(c.cardStatus ?? c.card_status);
  const statusFallback = pickCardStatus(c);
  const statusRaw = cardStatusExplicit || statusFallback || null;
  const onlineRaw = pickOnlineCardStatusRaw(c, raw);
  const expiry = resolveCardExpiry(c, raw);
  const velocityControls =
    c.velocityControls ||
    c.velocity_controls ||
    c.cardVelocityControls ||
    c.card_velocity_controls ||
    c.cardControlProfile?.velocityControls ||
    c.card_control_profile?.velocity_controls ||
    c.velocity ||
    c.spendingControls ||
    c.spending_controls ||
    null;
  return {
    card_number:
      c.cardNumber ||
      c.cardNo ||
      c.card_number ||
      c.cardNum ||
      c.card_num ||
      c.maskedCardNumber ||
      c.masked_card_number ||
      c.pan ||
      c.cardId ||
      c.card_id ||
      c.id,
    account_number: c.accountNumber || c.account_number || ACCOUNT_NUMBER,
    card_status: statusRaw ? mapWexCardStatusToFrench(statusRaw) : undefined,
    card_status_raw: statusRaw || undefined,
    online_card_status: onlineRaw ? mapOnlineCardStatusToFrench(onlineRaw) : undefined,
    online_card_status_raw: onlineRaw || undefined,
    embossing_name:
      c.embossingName ||
      c.embossing_name ||
      c.name ||
      c.cardName ||
      c.card_name ||
      c.embossedName ||
      c.embossed_name,
    driver_name: c.driverName || c.driver_name || c.driver || c.holderName || c.holder_name,
    vehicle_plate:
      c.vehiclePlate ||
      c.vehicle_plate ||
      c.plate ||
      c.licensePlate ||
      c.license_plate ||
      c.registrationNumber ||
      c.registration_number,
    card_type: c.cardType || c.card_type,
    velocity_controls: velocityControls || undefined,
    monthly_limit:
      Number(
        velocityControls?.monthlyAmount ??
          velocityControls?.monthly_amount ??
          velocityControls?.monthAmount ??
          velocityControls?.monthlyLimit ??
          velocityControls?.monthly_limit ??
          0
      ) || undefined,
    weekly_limit:
      Number(
        velocityControls?.weeklyAmount ??
          velocityControls?.weekly_amount ??
          velocityControls?.weeklyLimit ??
          velocityControls?.weekly_limit ??
          0
      ) || undefined,
    daily_limit:
      Number(
        velocityControls?.dailyAmount ??
          velocityControls?.daily_amount ??
          velocityControls?.dailyLimit ??
          velocityControls?.daily_limit ??
          0
      ) || undefined,
    expiry_date: expiry || undefined,
    updated_at: new Date().toISOString()
  };
}

async function syncToLocal(dateFrom, dateTo) {
  const meta = readData('sync_meta', { lastSync: null, totalTransactions: 0 });

  let newTransactions = 0;
  let totalTransactions = meta.totalTransactions || 0;
  let cardsCount = 0;
  let syncedAt = new Date().toISOString();

  const errors = [];

  let txsForCards = [];
  let debugLineItemsLogged = false;
  let cardsFromApi = [];

  try {
    // 0) Charger d'abord toutes les cartes WEX pour créer le référentiel de correspondance
    try {
      const cardsResp = await getCards();
      const cardsRaw =
        cardsResp?.cards ||
        cardsResp?.cardList ||
        cardsResp?.card_details ||
        cardsResp?.data ||
        cardsResp?.results ||
        cardsResp?.items ||
        cardsResp ||
        [];
      cardsFromApi = (Array.isArray(cardsRaw) ? cardsRaw : [])
        .map(normalizeCard)
        .filter((c) => c.card_number);

      // Enrichissement limites (test sur 3 cartes d'abord)
      const enrichedCards = [];
      for (const card of cardsFromApi.slice(0, 3)) {
        const cardNo = card?.card_number || card?.cardNumber || card?.cardNo;
        try {
          const cardDetail = await getCardVelocityControls(cardNo);
          const vc =
            cardDetail?.velocityControls ||
            cardDetail?.velocity_controls ||
            cardDetail?.cardVelocityControls ||
            cardDetail?.card_velocity_controls ||
            cardDetail?.cardControlProfile?.velocityControls ||
            cardDetail?.card_control_profile?.velocity_controls ||
            null;

          let defaultProfile = null;
          if (!vc) {
            const cardProduct =
              cardDetail?.cardProductOid ||
              cardDetail?.card_product_oid ||
              cardDetail?.cardProduct ||
              cardDetail?.card_product;
            defaultProfile = await getCardDefaultProfile(ACCOUNT_NUMBER, cardProduct);
          }

          const profileVc =
            defaultProfile?.velocityControls ||
            defaultProfile?.velocity_controls ||
            defaultProfile?.cardControlProfile?.velocityControls ||
            defaultProfile?.card_control_profile?.velocity_controls ||
            null;

          const finalVc = vc || profileVc;
          enrichedCards.push({
            ...card,
            velocity_controls: finalVc || card.velocity_controls || null,
            card_control_profile: cardDetail?.cardControlProfile || cardDetail?.card_control_profile || null,
            monthly_limit:
              Number(
                finalVc?.monthlyAmount ??
                  finalVc?.monthly_amount ??
                  finalVc?.monthAmount ??
                  finalVc?.monthlyLimit ??
                  finalVc?.monthly_limit ??
                  card.monthly_limit ??
                  0
              ) || null,
            weekly_limit:
              Number(
                finalVc?.weeklyAmount ??
                  finalVc?.weekly_amount ??
                  finalVc?.weeklyLimit ??
                  finalVc?.weekly_limit ??
                  card.weekly_limit ??
                  0
              ) || null,
            daily_limit:
              Number(
                finalVc?.dailyAmount ??
                  finalVc?.daily_amount ??
                  finalVc?.dailyLimit ??
                  finalVc?.daily_limit ??
                  card.daily_limit ??
                  0
              ) || null,
            _velocityEnriched: true
          });
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[WEX] Erreur velocity card ${cardNo}:`, err?.message || err);
          enrichedCards.push({ ...card, _velocityEnriched: false });
        }
      }

      for (const card of cardsFromApi.slice(3)) {
        enrichedCards.push(card);
      }
      cardsFromApi = enrichedCards;
      if (cardsFromApi.length) {
        writeData('cards', cardsFromApi);
        // eslint-disable-next-line no-console
        console.log('[WEX] ✅ Cartes sauvegardées avec limites');
      }
    } catch (e) {
      errors.push(`[WEX] getCards listing: ${e?.message || e}`);
    }

    const txResp = await searchTransactions(dateFrom, dateTo);
    const txsRaw =
      txResp?.transactions ||
      txResp?.transaction ||
      txResp?.data ||
      txResp?.results ||
      txResp?.items ||
      txResp?.content ||
      txResp ||
      [];
    const txs = (Array.isArray(txsRaw) ? txsRaw : [])
      .map(normalizeTx)
      .filter((t) => t.transaction_ref);

    // Charger le référentiel cartes local pour croiser immatriculation/conducteur.
    const cardsData = cardsFromApi.length ? cardsFromApi : readData('cards', []);
    const cardMap = {};
    if (Array.isArray(cardsData)) {
      cardsData.forEach((card) => {
        const key = card.cardNumber || card.card_number || card.maskedCardNumber || card.masked_card_number;
        for (const k of cardNoCandidates(key)) {
          cardMap[String(k)] = card;
        }
      });
    }

    // Mapping manuel local (si WEX ne fournit pas le nom carte véhicule)
    const manualMap = readData('card_vehicle_mapping', {});

    // 2) Enrichir chaque transaction via /transaction/details
    const enriched = [];
    const numOrNull = (v) => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    for (const tx of txs) {
      // Priorité : transactionId (obligatoire pour /transaction/details)
      const txId = tx.transactionId || tx.transaction_id || tx.transaction_ref || tx.transactionRef || tx.transactionRef;
      if (!txId) {
        enriched.push({ ...tx, _enriched: false });
        continue;
      }

      try {
        const details = await getTransactionDetails(txId);

        if (details) {
          // Debug temporaire des champs véhicule disponibles
          // eslint-disable-next-line no-console
          console.log('[WEX DEBUG] champs véhicule tx:', {
            // Depuis search-transactions (tx)
            tx_licensePlate: tx.licensePlate,
            tx_cardNumber: tx.cardNumber,
            tx_driverName: tx.driverName,

            // Depuis transaction/details (details)
            det_licensePlate: details.licensePlate,
            det_vehicleId: details.vehicleId,
            det_embossingName: details.embossingName,
            det_secondCardNo: details.secondCardNo,
            det_adjProduct: details.adjProduct,
            det_cardNumber: details.cardNumber,

            // Depuis lineItems
            lineItems_sample:
              Array.isArray(details.lineItems) && details.lineItems.length > 0
                ? details.lineItems[0]
                : null
          });

          const matchedCard =
            cardMap[String(normalizeCardNo(tx.cardNumber) || '')] ||
            cardMap[String(normalizeCardNo(details?.cardNumber) || '')] ||
            cardMap[String(normalizeCardNo(tx.card_number) || '')] ||
            null;

          const vehicleCardNumber =
            normalizeCardNo(
              details.secondCardNo ||
                details.second_card_no ||
                details.vehicleCardNumber ||
                details.vehicle_card_number ||
                details.linkedCardNo ||
                details.linked_card_no ||
                details.cardNo2 ||
                details.card_no_2
            ) || null;

          const matchedVehicleCard =
            (vehicleCardNumber
              ? cardMap[String(vehicleCardNumber)] || cardMap[String(cardNoCandidates(vehicleCardNumber)[1] || '')]
              : null) || null;

          const mappedVehicleCardName =
            (vehicleCardNumber && (manualMap?.[vehicleCardNumber] || manualMap?.[cardNoCandidates(vehicleCardNumber)[1]])) ||
            null;

          const vehicleCardName =
            mappedVehicleCardName ||
            details.vehicleCardName ||
            details.vehicle_card_name ||
            details.secondCardName ||
            details.second_card_name ||
            details.secondCardEmbossingName ||
            details.second_card_embossing_name ||
            matchedVehicleCard?.embossingName ||
            matchedVehicleCard?.embossing_name ||
            matchedVehicleCard?.cardName ||
            matchedVehicleCard?.card_name ||
            null;

          const plateFromLinkedVehicleCard = plateFromCardRecord(matchedVehicleCard);
          const resolvedLicensePlate =
            plateFromLinkedVehicleCard ||
            String(details.licensePlate || details.license_plate || '').trim() ||
            String(tx.licensePlate || '').trim() ||
            plateFromCardRecord(matchedCard) ||
            null;

          const paymentCardEmbossing =
            embossingFromCardRecord(matchedCard) ||
            String(details.embossingName || details.embossing_name || '').trim() ||
            null;
          const linkedVehicleEmbossing =
            embossingFromCardRecord(matchedVehicleCard) ||
            String(details.secondCardEmbossingName || details.second_card_embossing_name || '').trim() ||
            null;
          // "Société" doit refléter l'embossage carte, jamais un alias de plaque/mapping véhicule.
          const societeEmbossing = linkedVehicleEmbossing || paymentCardEmbossing || null;

          // Enrichissement à partir de `lineItems` (le litrage + prix sont souvent dans les lignes produits).
          const lineItems = Array.isArray(details.lineItems)
            ? details.lineItems
            : Array.isArray(details.line_items)
              ? details.line_items
              : Array.isArray(details.items)
                ? details.items
                : [];

          if (!debugLineItemsLogged && Array.isArray(lineItems) && lineItems.length > 0) {
            debugLineItemsLogged = true;
            // eslint-disable-next-line no-console
            console.log('[WEX DEBUG] lineItems:', JSON.stringify(lineItems, null, 2));
          }

          let fuelQuantity = 0;
          let fuelUnitPrice = 0;
          let amountHT = 0;
          let amountTVA = 0;
          let amountTTC = 0;

          if (Array.isArray(lineItems) && lineItems.length > 0) {
            // Chercher une ligne carburant (diesel/essence/fuel/gazole)
            const fuelLine =
              lineItems.find(
                (item) =>
                  String(item?.productDescription || item?.product_description || '')
                    .toLowerCase()
                    .match(/diesel|essence|fuel|gazole/) ||
                  String(item?.productDescription || item?.product_description || '').toLowerCase().includes('gazole') ||
                  item?.type === 'FUEL' ||
                  numOrNull(item?.quantity) > 0 ||
                  numOrNull(item?.qty) > 0 ||
                  numOrNull(item?.volume) > 0
              ) || lineItems[0];

            if (fuelLine) {
              fuelQuantity =
                parseFloat(fuelLine.quantity || fuelLine.volume || fuelLine.qty || 0) ||
                parseFloat(fuelLine.totalQuantity || fuelLine.total_quantity || 0) ||
                0;

              fuelUnitPrice =
                parseFloat(
                  fuelLine.originalUnitPrice ||
                    fuelLine.original_unit_price ||
                    fuelLine.unitPrice ||
                    fuelLine.pricePerUnit ||
                    fuelLine.cpl ||
                    fuelLine.price ||
                    fuelLine.unit_price ||
                    0
                ) || 0;

              amountHT =
                parseFloat(fuelLine.amount || fuelLine.totalAmount || fuelLine.netAmount || fuelLine.total_amount || 0) || 0;

              // TTC potentiellement porté par la ligne (selon schéma WEX)
              amountTTC =
                parseFloat(
                  fuelLine.originalValue ||
                    fuelLine.original_value ||
                  fuelLine.customerAmount ||
                    fuelLine.grossAmount ||
                    fuelLine.amountInclTax ||
                    fuelLine.totalAmountInclTax ||
                    fuelLine.totalAmountTTC ||
                    fuelLine.totalInclTax ||
                    0
                ) || 0;
            }
          }

          // TVA : prioriser détail transaction (ou fallback ligne)
          amountTVA =
            numOrNull(
              details.customerTaxAmount ||
                details.total_customer_tax ||
                details.customer_tax_amount ||
                details.totalTax ||
                details.taxAmount
            ) ??
            numOrNull(
              lineItems?.[0]?.taxAmount ||
                lineItems?.[0]?.vatAmount ||
                lineItems?.[0]?.tax ||
                lineItems?.[0]?.totalTax
            ) ??
            0;

          // TTC payé : prioriser les champs "montant payé" si présents
          amountTTC =
            amountTTC ||
            numOrNull(
              details.originalValue ||
                details.original_value ||
              details.paidAmount ||
                details.paymentAmount ||
                details.settlementAmount ||
                details.customerAmount ||
                details.totalAmountInclTax ||
                details.totalAmountTTC ||
                details.totalAmount ||
                details.invoiceAmount ||
                tx.customerAmount ||
                tx.amount_ttc
            ) ||
            0;

          // Si amountHT toujours 0, calculer depuis TTC - TVA
          if (amountHT === 0 && amountTTC > 0 && amountTVA > 0) {
            amountHT = amountTTC - amountTVA;
          }

          // Si fuelUnitPrice toujours 0, utiliser cpl (si présent)
          if (fuelUnitPrice === 0 && numOrNull(details.cpl) > 0) {
            fuelUnitPrice = Number(numOrNull(details.cpl));
          }

          // Prix TTC "ticket" prioritaire
          const originalUnitPrice =
            numOrNull(
              details.originalUnitPrice ||
                details.original_unit_price ||
                lineItems?.[0]?.originalUnitPrice ||
                lineItems?.[0]?.original_unit_price
            ) ?? null;

          // Si fuelQuantity toujours 0, calculer depuis montant / prix unitaire
          if (fuelQuantity === 0 && fuelUnitPrice > 0 && amountTTC > 0) {
            fuelQuantity = amountTTC / fuelUnitPrice;
          }

          const grossUnitPrice =
            originalUnitPrice ??
            (fuelQuantity > 0 && amountTTC > 0
              ? amountTTC / fuelQuantity
              : numOrNull(details.grossCustomerUnitPrice ?? details.gross_unit_price) ?? null);

          const netUnitPrice =
            fuelQuantity > 0 && amountHT > 0 ? amountHT / fuelQuantity : fuelUnitPrice > 0 ? fuelUnitPrice : null;
          const customerRebateTotal =
            numOrNull(
              details.customerRebateTotal ??
                details.customer_rebate_total ??
                lineItems?.[0]?.customerRebateTotal ??
                lineItems?.[0]?.customer_rebate_total
            ) ?? null;
          const customerAmountFacture =
            numOrNull(
              details.customerAmount ??
                details.customer_amount ??
                lineItems?.[0]?.customerValue ??
                lineItems?.[0]?.customer_value
            ) ?? null;

          const odoMeter = numOrNull(details.odoMeter || details.odometer || details.odo_meter || details.mileage) ?? null;
          const authorisationNo = details.authorisationNo || details.authorizationNo || details.authorisation_no || null;

          const enrichedTx = {
            ...tx,

            // Champs “détails” (noms demandés)
            fuelQuantity: fuelQuantity > 0 ? fuelQuantity : null,
            fuelUnitPrice: fuelUnitPrice > 0 ? fuelUnitPrice : null,
            fuelTransactionValue: amountHT > 0 ? amountHT : null,
            amountHT: amountHT > 0 ? amountHT : null,
            amountTVA: amountTVA > 0 ? amountTVA : null,
            amountTTC: amountTTC > 0 ? amountTTC : null,
            customerRebateTotal,
            customer_rebate_total: customerRebateTotal,
            customerAmountFacture,
            customer_amount_facture: customerAmountFacture,
            taxRate: numOrNull(details.taxRate ?? details.tax_rate) ?? 0,
            netUnitPrice: netUnitPrice,
            grossUnitPrice: grossUnitPrice,
            odoMeter,
            authorisationNo,

            // Véhicule : plaque fiche carte (carte véhicule liée en priorité), jamais l’embossage comme plaque
            vehiclePlate: resolvedLicensePlate,
            driverName:
              tx.driverName ||
              details.driverName ||
              matchedCard?.driverName ||
              matchedCard?.driver_name ||
              matchedCard?.embossingName ||
              matchedCard?.embossing_name ||
              null,
            vehicleCardNumber,
            vehicle_card_number: vehicleCardNumber,
            vehicleCardName: vehicleCardName || null,
            vehicle_card_name: vehicleCardName || null,
            societeEmbossing: societeEmbossing || null,
            societe_embossing: societeEmbossing || null,

            // Champs “UI/stats” (backward compatible)
            totalTransQuantity: fuelQuantity > 0 ? fuelQuantity : tx.totalTransQuantity ?? tx.quantity_liters ?? null,
            quantity_liters: fuelQuantity > 0 ? fuelQuantity : tx.quantity_liters ?? null,
            fuelUnitPrice: fuelUnitPrice > 0 ? fuelUnitPrice : tx.fuelUnitPrice ?? null,
            unit_price: netUnitPrice ?? (fuelUnitPrice > 0 ? fuelUnitPrice : tx.unit_price) ?? null,
            customerAmount: amountTTC > 0 ? amountTTC : tx.customerAmount ?? tx.amount_ttc ?? null,
            amount_ttc: amountTTC > 0 ? amountTTC : tx.amount_ttc ?? null,
            amount_ht: amountHT > 0 ? amountHT : tx.amount_ht ?? null,
            licensePlate: resolvedLicensePlate,
            vehicle_id: resolvedLicensePlate || (tx.vehicle_id ? String(tx.vehicle_id).trim() || null : null),
            // Champs déjà existants conservés (driver/site/product/date/etc.)
            _enriched: true
          };

          enriched.push(enrichedTx);
        } else {
          enriched.push({ ...tx, _enriched: false });
        }
      } catch (e) {
        errors.push(`[WEX] Erreur enrichissement tx ${txId}: ${e?.message || e}`);
        enriched.push({ ...tx, _enriched: false });
      }

      // Petites pauses pour ne pas surcharger WEX
      // (et éviter les timeouts / rate limits)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    txsForCards = enriched;
    const up = upsertTransactions(enriched);
    newTransactions = up.inserted;
    totalTransactions = up.total;
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  try {
    // Stratégie robuste:
    // 1) Si les transactions contiennent des card_number, on appelle /card/details pour chaque cardNo.
    // 2) Sinon, on tente un endpoint de listing via getCards().
    const cardNos = Array.from(
      new Set(
        (txsForCards || [])
          .map((t) => t.card_number)
          .filter(Boolean)
          .map((x) => String(x))
      )
    );

    let cards = [];
    if (cardNos.length > 0) {
      const token = await getToken();
      const maxCards = 200; // garde-fou
      for (const cardNo of cardNos.slice(0, maxCards)) {
        try {
          // L'API renvoie "errorField.cardNo must not be blank" => champ attendu: cardNo
          const detailsResp = await wexPost('/card/details', { cardNo }, token);
          const raw = detailsResp?.card || detailsResp?.cards || detailsResp;
          if (Array.isArray(raw)) {
            cards.push(
              ...raw
                .map((x) => {
                  const nc = normalizeCard(x);
                  if (!nc?.card_number) nc.card_number = String(cardNo);
                  return nc;
                })
                .filter((c) => c.card_number)
            );
          } else if (raw && typeof raw === 'object') {
            const nc = normalizeCard(raw);
            if (!nc?.card_number) nc.card_number = String(cardNo);
            cards.push(nc);
          }
        } catch (e) {
          errors.push(`[WEX] card/details cardNo=${cardNo}: ${e?.message || e}`);
        }
      }
    }

    if (!cards.length) {
      const cardsResp = await getCards();
      const cardsRaw =
        cardsResp?.cards ||
        cardsResp?.cardList ||
        cardsResp?.card_details ||
        cardsResp?.data ||
        cardsResp?.results ||
        cardsResp?.items ||
        cardsResp ||
        [];
      cards = (Array.isArray(cardsRaw) ? cardsRaw : []).map(normalizeCard).filter((c) => c.card_number);
    }

    // Si on a déjà récupéré la liste complète en début de sync, la préférer.
    // Toujours conserver la liste complète des cartes WEX,
    // en y fusionnant les éventuels détails récupérés carte par carte.
    const mergedMap = new Map();
    const allCards = [...(cardsFromApi || []), ...(cards || [])];
    allCards.forEach((c) => {
      const key = c?.card_number || c?.cardNumber || c?.cardNo;
      if (!key) return;
      const k = String(normalizeCardNo(key) || key).trim();
      if (!k) return;
      const prev = mergedMap.get(k) || {};
      mergedMap.set(k, mergeCardRecords(prev, { ...c, card_number: k }));
    });
    const mergedCards = Array.from(mergedMap.values());

    writeData('cards', mergedCards);
    cardsCount = mergedCards.length;
  } catch (e) {
    errors.push(String(e?.message || e));
  }

  try {
    const account = await getAccount().catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[WEX] Erreur getAccount:', e?.message || e);
      return null;
    });
    if (account) {
      writeData('account', account);
      // eslint-disable-next-line no-console
      console.log('[WEX] ✅ Données compte sauvegardées');
    }
  } catch (e) {
    errors.push(`[WEX] getAccount: ${e?.message || e}`);
  }

  const nextMeta = {
    lastSync: syncedAt,
    totalTransactions,
    lastSyncRange: { dateFrom, dateTo },
    errors
  };
  writeData('sync_meta', nextMeta);

  return { newTransactions, totalTransactions, cardsCount, syncedAt, errors };
}

module.exports = {
  login,
  getToken,
  searchTransactions,
  getTransactionDetails,
  getCards,
  getCardVelocityControls,
  getCardDefaultProfile,
  getAccount,
  syncToLocal
};


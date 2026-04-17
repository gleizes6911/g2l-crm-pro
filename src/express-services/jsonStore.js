const fs = require('fs');
const path = require('path');

const WEX_DATA_DIR = path.join(__dirname, '..', 'data', 'wex');

function ensureDir() {
  if (!fs.existsSync(WEX_DATA_DIR)) {
    fs.mkdirSync(WEX_DATA_DIR, { recursive: true });
  }
}

function filePathFor(filename) {
  const safe = String(filename || '').replace(/[^a-zA-Z0-9_\-./]/g, '');
  if (!safe) {
    throw new Error('Nom de fichier JSON invalide');
  }
  return path.join(WEX_DATA_DIR, safe.endsWith('.json') ? safe : `${safe}.json`);
}

function readData(filename, defaultValue) {
  ensureDir();
  const p = filePathFor(filename);
  if (!fs.existsSync(p)) {
    const initial =
      defaultValue !== undefined
        ? defaultValue
        : filename === 'sync_meta'
          ? { lastSync: null, totalTransactions: 0 }
          : [];
    fs.writeFileSync(p, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw || 'null') ?? defaultValue ?? [];
  } catch (e) {
    throw new Error(`JSON invalide dans ${p}: ${e.message}`);
  }
}

function writeData(filename, data) {
  ensureDir();
  const p = filePathFor(filename);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function upsertTransactions(newTxs) {
  const incoming = Array.isArray(newTxs) ? newTxs : [];
  const existing = readData('transactions', []);

  const byRef = new Map();
  existing.forEach((t) => {
    const ref = t?.transaction_ref || t?.transactionRef;
    if (ref) byRef.set(String(ref), t);
  });

  let inserted = 0;
  incoming.forEach((t) => {
    const ref = t?.transaction_ref || t?.transactionRef;
    if (!ref) return;
    const key = String(ref);
    const had = byRef.has(key);
    byRef.set(key, { ...(had ? byRef.get(key) : {}), ...t, transaction_ref: key });
    if (!had) inserted += 1;
  });

  const merged = Array.from(byRef.values()).sort((a, b) => {
    const da = a?.transaction_date || a?.transactionDate || '';
    const db = b?.transaction_date || b?.transactionDate || '';
    return String(db).localeCompare(String(da));
  });

  writeData('transactions', merged);
  return { inserted, total: merged.length };
}

module.exports = {
  WEX_DATA_DIR,
  readData,
  writeData,
  upsertTransactions
};


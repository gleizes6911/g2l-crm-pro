const express = require('express');
const { readData } = require('../services/jsonStore');
const wexService = require('../services/wexService');

const router = express.Router();

function iso(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

function parseNumber(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Libellé véhicule : plaque uniquement (l’embossage / société est ailleurs). */
function transactionVehicleLabel(t) {
  const plate = String(t?.licensePlate || t?.vehiclePlate || t?.vehicle_id || '').trim();
  return plate || 'Inconnu';
}

/** Libellé conducteur (aligné sur FuelTab, colonne « Conducteur »). */
function transactionDriverLabel(t) {
  const raw = t?.driverName ?? t?.driver_name ?? '';
  const s = String(raw).trim();
  return s || 'Inconnu';
}

function transactionAmountTTC(t) {
  return Number(t?.customerAmount ?? t?.amount_ttc ?? t?.amountTTC ?? 0);
}

function transactionLiters(t) {
  return Number(t?.totalTransQuantity ?? t?.quantity_liters ?? t?.fuelQuantity ?? 0);
}

function txCardNumber(t) {
  return String(t?.cardNumber ?? t?.card_number ?? t?.cardNo ?? t?.card_no ?? '').trim();
}

function filterTxs(all, from, to, vehicle) {
  // Comparaison robuste au niveau "jour" (évite soucis timezone/heure)
  const fromDay = from ? String(from) : null; // YYYY-MM-DD
  const toDay = to ? String(to) : null; // YYYY-MM-DD
  const vq = vehicle ? String(vehicle).toLowerCase() : null;

  function toISODateDay(val) {
    if (!val) return null;
    // Gérer les timestamps epoch (seconds/ms) ou nombres
    if (typeof val === 'number' && Number.isFinite(val)) {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    const s = String(val).trim();

    // Timestamp epoch "seconds" (10 chiffres) / "ms" (13 chiffres)
    if (/^\d{10}$/.test(s)) {
      const d = new Date(Number(s) * 1000);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (/^\d{13}$/.test(s)) {
      const d = new Date(Number(s));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    // Timestamp ISO "naïf" -> on force UTC (évite décalage du jour)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(s)) {
      const d = new Date(`${s}Z`);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  return (all || []).filter((t) => {
    const dISO = toISODateDay(t.transaction_date || t.transaction_ref);
    if ((fromDay || toDay) && !dISO) return false;
    if (fromDay && (!dISO || dISO < fromDay)) return false;
    if (toDay && (!dISO || dISO > toDay)) return false;
    if (vq) {
      const vv = String(t.vehicle_id || '').toLowerCase();
      if (!vv.includes(vq)) return false;
    }
    return true;
  });
}

router.post('/sync', async (req, res) => {
  const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
  req.setTimeout(SYNC_TIMEOUT_MS);
  res.setTimeout(SYNC_TIMEOUT_MS);
  try {
    const { dateFrom, dateTo } = req.body || {};
    const range = defaultRange();
    const from = dateFrom || range.dateFrom;
    const to = dateTo || range.dateTo;
    console.log(`[WEX API] sync demandé: ${from} -> ${to}`);
    const result = await wexService.syncToLocal(from, to);
    const errors = result?.errors || [];
    const success = errors.length === 0;
    res.json({ success, ...result, syncedAt: result.syncedAt });
  } catch (e) {
    console.error('[WEX API] Erreur sync:', e);
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

router.get('/transactions', (req, res) => {
  const { from, to, vehicle, page = '1', limit = '25' } = req.query || {};
  const p = Math.max(1, parseNumber(page, 1));
  const l = Math.min(200, Math.max(1, parseNumber(limit, 25)));

  const all = readData('transactions', []);
  const filtered = filterTxs(all, from, to, vehicle);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / l));
  const start = (p - 1) * l;
  const data = filtered.slice(start, start + l);

  res.json({ data, total, page: p, totalPages });
});

router.get('/cards/period-details', (req, res) => {
  const { from, to } = req.query || {};
  const all = readData('transactions', []);
  const filtered = filterTxs(all, from, to, null);
  const byCard = {};

  filtered.forEach((tx) => {
    const cardNumber = txCardNumber(tx);
    if (!cardNumber) return;
    if (!byCard[cardNumber]) {
      byCard[cardNumber] = {
        cardNumber,
        billedAmount: 0,
        fees: 0,
        amountTTC: 0,
        liters: 0,
        txCount: 0,
        transactions: []
      };
    }

    const billedAmount = Number(tx.customerAmountFacture ?? tx.customer_amount_facture ?? tx.customerAmount ?? 0) || 0;
    const fees = Number(tx.customerRebateTotal ?? tx.customer_rebate_total ?? 0) || 0;
    const amountTTC = Number(tx.amountTTC ?? tx.amount_ttc ?? tx.customerAmount ?? 0) || 0;
    const liters = Number(tx.fuelQuantity ?? tx.totalTransQuantity ?? tx.quantity_liters ?? 0) || 0;

    byCard[cardNumber].billedAmount += billedAmount;
    byCard[cardNumber].fees += fees;
    byCard[cardNumber].amountTTC += amountTTC;
    byCard[cardNumber].liters += liters;
    byCard[cardNumber].txCount += 1;
    byCard[cardNumber].transactions.push({
      transaction_ref: tx.transaction_ref,
      transaction_date: tx.transaction_date || tx.effectiveAt || tx.transaction_ref || null,
      driverName: tx.driverName || tx.driver_name || '',
      station: tx.locationName || tx.site_name || '',
      product: tx.productDescription || tx.product_type || '',
      liters,
      amountTTC,
      fees,
      billedAmount
    });
  });

  Object.values(byCard).forEach((card) => {
    card.transactions.sort((a, b) => String(b.transaction_date || '').localeCompare(String(a.transaction_date || '')));
  });

  res.json({
    from: from || null,
    to: to || null,
    byCard
  });
});

router.get('/stats/summary', (req, res) => {
  const { from, to } = req.query || {};
  const all = readData('transactions', []);
  const filtered = filterTxs(all, from, to, null);

  let totalAmountTTC = 0;
  let totalLiters = 0;
  let weighted = 0;
  const vehicles = new Set();

  filtered.forEach((t) => {
    const amount = transactionAmountTTC(t);
    const liters = transactionLiters(t);
    const price = liters > 0 ? amount / liters : Number(t.unit_price || 0);
    totalAmountTTC += amount;
    totalLiters += liters;
    weighted += liters * price;
    const veh = transactionVehicleLabel(t);
    if (veh && veh !== 'Inconnu') vehicles.add(veh);
  });

  const avgPricePerLiter = totalLiters > 0 ? weighted / totalLiters : 0;

  res.json({
    totalAmountTTC,
    totalLiters,
    avgPricePerLiter,
    transactionCount: filtered.length,
    vehicleCount: vehicles.size
  });
});

router.get('/stats/monthly', (req, res) => {
  const { year } = req.query || {};
  const y = parseNumber(year, new Date().getFullYear());
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  const buckets = months.map((m, idx) => ({
    month: m,
    monthIndex: idx,
    amount: 0,
    liters: 0,
    count: 0
  }));

  const all = readData('transactions', []);
  all.forEach((t) => {
    const d = t.transaction_date ? new Date(t.transaction_date) : null;
    if (!d || Number.isNaN(d.getTime())) return;
    if (d.getFullYear() !== y) return;
    const idx = d.getMonth();
    const amount = transactionAmountTTC(t);
    const liters = transactionLiters(t);
    buckets[idx].amount += amount;
    buckets[idx].liters += liters;
    buckets[idx].count += 1;
  });

  res.json(buckets.map((b) => ({ month: b.month, amount: b.amount, liters: b.liters, count: b.count })));
});

router.get('/stats/vehicles', (req, res) => {
  const { from, to } = req.query || {};
  const all = readData('transactions', []);
  const filtered = filterTxs(all, from, to, null);

  const map = new Map();
  filtered.forEach((t) => {
    const vehicle = transactionVehicleLabel(t);
    if (!map.has(vehicle)) {
      map.set(vehicle, {
        vehicle,
        driverName: (t.driverName ?? t.driver_name) || '',
        amount: 0,
        liters: 0,
        txCount: 0,
        weighted: 0
      });
    }
    const row = map.get(vehicle);
    const amount = transactionAmountTTC(t);
    const liters = transactionLiters(t);
    const price = liters > 0 ? amount / liters : Number(t.unit_price || 0);
    row.amount += amount;
    row.liters += liters;
    row.txCount += 1;
    row.weighted += liters * price;
    if (!row.driverName && (t.driverName || t.driver_name)) row.driverName = t.driverName ?? t.driver_name;
  });

  const rows = Array.from(map.values()).map((r) => ({
    vehicle: r.vehicle,
    driverName: r.driverName,
    amount: r.amount,
    liters: r.liters,
    avgPricePerLiter: r.liters > 0 ? r.weighted / r.liters : 0,
    txCount: r.txCount
  }));

  rows.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  res.json(rows);
});

router.get('/stats/drivers', (req, res) => {
  const { from, to } = req.query || {};
  const all = readData('transactions', []);
  const filtered = filterTxs(all, from, to, null);

  const map = new Map();
  filtered.forEach((t) => {
    const driver = transactionDriverLabel(t);
    if (!map.has(driver)) {
      map.set(driver, {
        driver,
        amount: 0,
        liters: 0,
        txCount: 0,
        weighted: 0
      });
    }
    const row = map.get(driver);
    const amount = transactionAmountTTC(t);
    const liters = transactionLiters(t);
    const price = liters > 0 ? amount / liters : Number(t.unit_price || 0);
    row.amount += amount;
    row.liters += liters;
    row.txCount += 1;
    row.weighted += liters * price;
  });

  const rows = Array.from(map.values()).map((r) => ({
    driver: r.driver,
    amount: r.amount,
    liters: r.liters,
    avgPricePerLiter: r.liters > 0 ? r.weighted / r.liters : 0,
    txCount: r.txCount
  }));

  rows.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  res.json(rows);
});

router.get('/account/summary', (req, res) => {
  try {
    const account = readData('account', {}) || {};
    const transactions = readData('transactions', []) || [];
    const cards = readData('cards', []) || [];
    const manualLimits = readData('card_limits', {}) || {};

    const availableBalance = Number(
      account.calculatedAvailableBalance ??
        account.availableBalance ??
        account.available_balance ??
        account.currentAvailableBalance ??
        0
    );
    const accountSummary = {
      accountNumber: account.accountNo || account.accountNumber || process.env.WEX_ACCOUNT_NUMBER || '-',
      accountName: account.accountName || account.customerName || 'HOLDING G2L',
      accountStatus: account.accountStatus || account.status || '-',
      availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
      currency: account.currency || 'EUR'
    };

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    const toTs = (tx) => {
      const raw = tx?.effectiveAt ?? tx?.transaction_date ?? tx?.transaction_ref;
      if (raw == null) return null;
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw > 1e12 ? raw : raw > 1e9 ? raw * 1000 : raw;
      }
      const s = String(raw).trim();
      if (/^\d{13}$/.test(s)) return Number(s);
      if (/^\d{10}$/.test(s)) return Number(s) * 1000;
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return d.getTime();
      return null;
    };

    const txThisMonth = (Array.isArray(transactions) ? transactions : []).filter((tx) => {
      const ts = toTs(tx);
      return ts != null && ts >= firstDayOfMonth && ts <= lastDayOfMonth;
    });

    const cardConsumption = {};
    txThisMonth.forEach((tx) => {
      const key = String(
        tx.cardNumber ??
          tx.card_number ??
          tx.cardNo ??
          tx.card_no ??
          tx.vehicle_card_number ??
          ''
      ).trim();
      if (!key) return;
      if (!cardConsumption[key]) {
        cardConsumption[key] = {
          cardNumber: key,
          amountTTC: 0,
          amountHT: 0,
          liters: 0,
          txCount: 0
        };
      }
      cardConsumption[key].amountTTC += Number(tx.amountTTC ?? tx.customerAmount ?? tx.amount_ttc ?? 0) || 0;
      cardConsumption[key].amountHT += Number(tx.amountHT ?? tx.amount_ht ?? 0) || 0;
      cardConsumption[key].liters += Number(tx.fuelQuantity ?? tx.totalTransQuantity ?? tx.quantity_liters ?? 0) || 0;
      cardConsumption[key].txCount += 1;
    });

    const cardsList = Array.isArray(cards) ? cards : [];
    const enrichedCards = cardsList.map((card) => {
      const cardNumber = String(card.cardNumber ?? card.card_number ?? card.cardNo ?? card.card_no ?? '').trim();
      const manual = (cardNumber && manualLimits?.[cardNumber]) || {};
      const consumption = cardConsumption[cardNumber] || {
        amountTTC: 0,
        amountHT: 0,
        liters: 0,
        txCount: 0
      };

      const vc = card.velocityControls || card.velocity_controls || {};
      const apiMonthlyLimit = Number(
        vc.monthlyAmount ?? vc.monthly_amount ?? vc.monthAmount ?? vc.monthlyLimit ?? vc.monthly_limit ?? 0
      ) || null;
      const apiWeeklyLimit = Number(vc.weeklyAmount ?? vc.weekly_amount ?? vc.weeklyLimit ?? vc.weekly_limit ?? 0) || null;
      const apiDailyLimit = Number(vc.dailyAmount ?? vc.daily_amount ?? vc.dailyLimit ?? vc.daily_limit ?? 0) || null;
      const monthlyLimit = Number(card.monthly_limit ?? apiMonthlyLimit ?? manual.monthlyLimit ?? 0) || null;
      const weeklyLimit = Number(card.weekly_limit ?? apiWeeklyLimit ?? manual.weeklyLimit ?? 0) || null;
      const dailyLimit = Number(card.daily_limit ?? apiDailyLimit ?? manual.dailyLimit ?? 0) || null;

      const percentUsed = monthlyLimit && monthlyLimit > 0
        ? Math.round((consumption.amountTTC / monthlyLimit) * 100)
        : null;

      return {
        cardNumber: cardNumber || null,
        embossingName: card.embossingName || card.embossing_name || '-',
        driverName: card.driverName || card.driver_name || card.embossingName || card.embossing_name || '-',
        licensePlate: card.licensePlate || card.license_plate || card.vehiclePlate || card.vehicle_plate || '-',
        cardStatus: card.card_status || card.cardStatus || '-',
        onlineCardStatus: card.online_card_status || card.onlineCardStatus || '-',
        expiryDate: card.expiry_date || card.expiryDate || null,
        cardType: card.cardType || card.card_type || '-',
        monthlyAmountTTC: consumption.amountTTC,
        monthlyAmountHT: consumption.amountHT,
        monthlyLiters: consumption.liters,
        monthlyTxCount: consumption.txCount,
        monthlyLimit,
        weeklyLimit,
        dailyLimit,
        limitSource: monthlyLimit || weeklyLimit || dailyLimit ? (manual.monthlyLimit || manual.weeklyLimit || manual.dailyLimit ? 'manuel' : 'api') : null,
        percentUsed
      };
    });

    const monthlyTotal = txThisMonth.reduce((acc, tx) => {
      acc.amountTTC += Number(tx.amountTTC ?? tx.customerAmount ?? tx.amount_ttc ?? 0) || 0;
      acc.amountHT += Number(tx.amountHT ?? tx.amount_ht ?? 0) || 0;
      acc.liters += Number(tx.fuelQuantity ?? tx.totalTransQuantity ?? tx.quantity_liters ?? 0) || 0;
      acc.txCount += 1;
      return acc;
    }, { amountTTC: 0, amountHT: 0, liters: 0, txCount: 0 });

    res.json({
      account: accountSummary,
      monthlyTotal,
      cards: enrichedCards,
      period: {
        from: new Date(firstDayOfMonth).toISOString().slice(0, 10),
        to: new Date(lastDayOfMonth).toISOString().slice(0, 10)
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[WEX] Erreur account/summary:', err?.message || err);
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

router.get('/cards', (req, res) => {
  const cards = readData('cards', []);
  res.json(cards);
});

router.get('/meta', (req, res) => {
  const meta = readData('sync_meta', { lastSync: null, totalTransactions: 0 });
  res.json(meta);
});

module.exports = router;


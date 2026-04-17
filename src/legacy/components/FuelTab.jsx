import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import {
  Fuel,
  Truck,
  Calendar,
  RefreshCw,
  Download,
  TrendingUp,
  TrendingDown,
  Users
} from 'lucide-react';
import API_BASE from '../config/api';
const formatDateYMD = (d) => {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dateObj.getTime())) return '';
  return dateObj.toISOString().slice(0, 10);
};

/** Plaque (fiche carte véhicule / conducteur), sans embossage. */
const wexTransactionVehicleDisplay = (t) => {
  const plate = String(t?.licensePlate || t?.vehiclePlate || t?.vehicle_id || '').trim();
  return plate || '-';
};

/** Embossage / société (carte véhicule liée ou carte paiement). */
const wexSocieteDisplay = (t) => {
  const s = String(
    t?.societeEmbossing || t?.societe_embossing || t?.vehicleCardName || t?.vehicle_card_name || ''
  ).trim();
  return s || '-';
};

const startOfMonth = (d) => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfMonth = (d) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1);
  x.setDate(0);
  x.setHours(23, 59, 59, 999);
  return x;
};

const monthsRange = (mode) => {
  const now = new Date();
  if (mode === 'current') {
    return { dateFrom: formatDateYMD(startOfMonth(now)), dateTo: formatDateYMD(endOfMonth(now)) };
  }
  if (mode === 'previous') {
    const prev = new Date(now);
    prev.setMonth(prev.getMonth() - 1);
    return { dateFrom: formatDateYMD(startOfMonth(prev)), dateTo: formatDateYMD(endOfMonth(prev)) };
  }
  if (mode === '3m') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 2);
    return { dateFrom: formatDateYMD(startOfMonth(from)), dateTo: formatDateYMD(endOfMonth(now)) };
  }
  if (mode === '6m') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 5);
    return { dateFrom: formatDateYMD(startOfMonth(from)), dateTo: formatDateYMD(endOfMonth(now)) };
  }
  // custom -> renvoyé ailleurs
  return { dateFrom: formatDateYMD(startOfMonth(now)), dateTo: formatDateYMD(endOfMonth(now)) };
};

const toFrMoney = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '0';

const toFrNumber = (v) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : '0';

const normalizeUnitPriceTTC = (rawPrice, liters, amountTTC) => {
  const raw = Number(rawPrice);
  const derived = Number(liters) > 0 && Number(amountTTC) > 0 ? Number(amountTTC) / Number(liters) : null;

  if (!Number.isFinite(raw) || raw <= 0) {
    return Number.isFinite(derived) && derived > 0 ? derived : 0;
  }

  // Si le prix API est en centimes (ex: 199.9), le convertir en euros (1.999).
  if (raw > 10) {
    const asEuro = raw / 100;
    if (Number.isFinite(derived) && derived > 0) {
      const diffEuro = Math.abs(asEuro - derived);
      const diffRaw = Math.abs(raw - derived);
      return diffEuro <= diffRaw ? asEuro : raw;
    }
    return asEuro;
  }

  return raw;
};

const FuelTab = ({ onBack }) => {
  const [rangeMode, setRangeMode] = useState('current'); // current|previous|3m|6m|custom
  const [customFrom, setCustomFrom] = useState(formatDateYMD(new Date()));
  const [customTo, setCustomTo] = useState(formatDateYMD(new Date()));

  const dateFrom = useMemo(() => {
    if (rangeMode !== 'custom') return monthsRange(rangeMode).dateFrom;
    return customFrom;
  }, [rangeMode, customFrom]);

  const dateTo = useMemo(() => {
    if (rangeMode !== 'custom') return monthsRange(rangeMode).dateTo;
    return customTo;
  }, [rangeMode, customTo]);

  const [vehicleFilter, setVehicleFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [vehiclesTop, setVehiclesTop] = useState([]);
  const [driversTop, setDriversTop] = useState([]);
  const [vehiclesForDropdown, setVehiclesForDropdown] = useState([]);

  const [txs, setTxs] = useState([]);
  const [txTotal, setTxTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [txSortKey, setTxSortKey] = useState('transaction_date');
  const [txSortDir, setTxSortDir] = useState('desc');

  const [cards, setCards] = useState([]);
  const [accountSummary, setAccountSummary] = useState(null);
  const [periodCardDetails, setPeriodCardDetails] = useState({});
  const [selectedCardNumber, setSelectedCardNumber] = useState(null);
  const [cardsCollapsed, setCardsCollapsed] = useState(true);
  const [cardFilter, setCardFilter] = useState('all');

  const fetchMeta = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/wex/meta`);
      const data = await res.json();
      setLastSync(data?.lastSync || null);
    } catch {
      // ignore
    }
  };

  const fetchSummary = async () => {
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    const res = await fetch(`${API_BASE}/api/wex/stats/summary?${params.toString()}`);
    const data = await res.json();
    setSummary(data);
  };

  const fetchMonthly = async () => {
    const year = new Date(dateTo).getFullYear();
    const res = await fetch(`${API_BASE}/api/wex/stats/monthly?year=${year}`);
    const data = await res.json();
    setMonthly(data || []);
  };

  const fetchVehicles = async () => {
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    const res = await fetch(`${API_BASE}/api/wex/stats/vehicles?${params.toString()}`);
    const data = await res.json();
    setVehiclesTop((data || []).slice(0, 10));
    setVehiclesForDropdown(data || []);
  };

  const fetchDrivers = async () => {
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    const res = await fetch(`${API_BASE}/api/wex/stats/drivers?${params.toString()}`);
    const data = await res.json();
    setDriversTop((data || []).slice(0, 15));
  };

  const fetchCards = async () => {
    const res = await fetch(`${API_BASE}/api/wex/cards`);
    const data = await res.json();
    setCards(data || []);
  };

  const fetchAccountSummary = async () => {
    const res = await fetch(`${API_BASE}/api/wex/account/summary`);
    const data = await res.json();
    setAccountSummary(data || null);
  };

  const fetchCardPeriodDetails = async () => {
    const params = new URLSearchParams({ from: dateFrom, to: dateTo });
    const res = await fetch(`${API_BASE}/api/wex/cards/period-details?${params.toString()}`);
    const data = await res.json();
    setPeriodCardDetails(data?.byCard || {});
  };

  const fetchTransactions = async () => {
    const params = new URLSearchParams({
      from: dateFrom,
      to: dateTo,
      vehicle: vehicleFilter || '',
      page: String(page),
      limit: String(limit)
    });
    const res = await fetch(`${API_BASE}/api/wex/transactions?${params.toString()}`);
    const data = await res.json();
    setTxs(data?.data || []);
    setTxTotal(data?.total || 0);
  };

  const fetchAll = async () => {
    await Promise.all([
      fetchMeta(),
      fetchSummary(),
      fetchMonthly(),
      fetchVehicles(),
      fetchDrivers(),
      fetchTransactions(),
      fetchCards(),
      fetchAccountSummary(),
      fetchCardPeriodDetails()
    ]);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, vehicleFilter, page]);

  const prevPeriod = useMemo(() => {
    const fromObj = new Date(dateFrom);
    const toObj = new Date(dateTo);
    const days = Math.round((toObj - fromObj) / (1000 * 60 * 60 * 24));
    const prevTo = new Date(fromObj);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - days);
    return { prevFrom: formatDateYMD(prevFrom), prevTo: formatDateYMD(prevTo) };
  }, [dateFrom, dateTo]);

  const [prevSummary, setPrevSummary] = useState(null);
  useEffect(() => {
    const loadPrev = async () => {
      try {
        const params = new URLSearchParams({ from: prevPeriod.prevFrom, to: prevPeriod.prevTo });
        const res = await fetch(`${API_BASE}/api/wex/stats/summary?${params.toString()}`);
        const data = await res.json();
        setPrevSummary(data);
      } catch {
        setPrevSummary(null);
      }
    };
    if (!prevPeriod.prevFrom || !prevPeriod.prevTo) return;
    loadPrev();
  }, [prevPeriod.prevFrom, prevPeriod.prevTo]);

  const avgPricePerLiter = summary?.avgPricePerLiter || 0;
  const highPriceThreshold = avgPricePerLiter > 0 ? avgPricePerLiter * 1.1 : Infinity;

  const sortedTxs = useMemo(() => {
    const arr = [...txs];
    const dir = txSortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const av = a?.[txSortKey];
      const bv = b?.[txSortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (txSortKey === 'transaction_date') {
        const av2 = a?.transaction_date || a?.transaction_ref;
        const bv2 = b?.transaction_date || b?.transaction_ref;
        return dir * (String(av2).localeCompare(String(bv2)));
      }
      if (txSortKey === 'societeEmbossing') {
        const av2 = wexSocieteDisplay(a);
        const bv2 = wexSocieteDisplay(b);
        return dir * String(av2).localeCompare(String(bv2));
      }
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return dir * (an - bn);
      return dir * String(av).localeCompare(String(bv));
    });
    return arr;
  }, [txs, txSortKey, txSortDir]);

  const hasKm = useMemo(() => sortedTxs.some((t) => t?.odoMeter != null && Number(t.odoMeter) > 0), [sortedTxs]);

  const handleSort = (key) => {
    if (txSortKey === key) {
      setTxSortDir(txSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setTxSortKey(key);
      setTxSortDir('desc');
    }
  };

  const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (synchro peut être longue)

  const syncWex = async () => {
    try {
      setSyncing(true);
      const payload = { dateFrom, dateTo };
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const res = await fetch(`${API_BASE}/api/wex/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(t);
      const txt = await res.text();
      let data;
      try {
        data = txt ? JSON.parse(txt) : {};
      } catch {
        data = { error: txt || `HTTP ${res.status}` };
      }
      await fetchAll();
      await fetchMeta();
      if (!res.ok) {
        const errorMsg = data?.error || `HTTP ${res.status}`;
        throw new Error(errorMsg);
      }
      const newTx = data?.newTransactions || 0;
      const cardsCount = data?.cardsCount || 0;
      const errors = Array.isArray(data?.errors) ? data.errors : [];
      const errTxt = errors.length ? `\n\nErreurs synchro: ${errors.slice(0, 3).join(' | ')}` : '';

      if (data?.success === false || errors.length > 0) {
        // eslint-disable-next-line no-alert
        alert(
          `Synchro en échec/partielle.\nNouvelles transactions : ${newTx}\nCartes reçues : ${cardsCount}${errTxt}`
        );
      } else {
        // eslint-disable-next-line no-alert
        alert(`Synchro OK.\nNouvelles transactions : ${newTx}\nCartes reçues : ${cardsCount}`);
      }
    } catch (e) {
      // eslint-disable-next-line no-alert
      if (e?.name === 'AbortError') {
        alert('Erreur synchro WEX: délai dépassé (5 min). Réduisez la période ou réessayez.');
      } else {
        alert(`Erreur synchro WEX: ${e?.message || e}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  const exportCsv = () => {
    const header = [
      'Date',
      'Société',
      'Véhicule',
      'Conducteur',
      'Station',
      ...(hasKm ? ['Km'] : []),
      'Produit',
      'Litres',
      'Prix/L TTC',
      'Montant HT',
      'TVA',
      'Montant TTC',
      'Frais',
      'Montant facturé'
    ];
    const rows = sortedTxs.map((t) => {
      const liters = Number(t.fuelQuantity ?? t.totalTransQuantity ?? t.quantity_liters ?? 0);
      const amountHT = Number(t.amountHT ?? t.amount_ht ?? 0);
      const amountTVA = Number(t.amountTVA ?? t.amount_tva ?? t.customerTaxAmount ?? 0);
      const amountTTC = Number(t.amountTTC ?? t.customerAmount ?? t.amount_ttc ?? 0);
      const fees = Number(t.customerRebateTotal ?? t.customer_rebate_total ?? 0);
      const billedAmount = Number(t.customerAmountFacture ?? t.customer_amount_facture ?? t.customerAmount ?? 0);
      const pricePerLiterTTC = normalizeUnitPriceTTC(t.grossUnitPrice, liters, amountTTC);
      const vehLabel = wexTransactionVehicleDisplay(t);
      const socLabel = wexSocieteDisplay(t);
      return [
        t.transaction_date ? format(new Date(t.transaction_date), 'dd-MM-yyyy') : '',
        socLabel === '-' ? '' : socLabel,
        vehLabel === '-' ? '' : vehLabel,
        t.driverName ?? t.driver_name ?? '',
        t.locationName ?? t.site_name ?? '',
        ...(hasKm ? [t.odoMeter != null ? Number(t.odoMeter).toLocaleString('fr-FR') : ''] : []),
        t.productDescription ?? t.product_type ?? '',
        liters > 0 ? Number(liters.toFixed(2)) : 0,
        pricePerLiterTTC > 0 ? Number(pricePerLiterTTC.toFixed(4)) : 0,
        amountHT > 0 ? Number(amountHT.toFixed(2)) : 0,
        amountTVA > 0 ? Number(amountTVA.toFixed(2)) : 0,
        amountTTC > 0 ? Number(amountTTC.toFixed(2)) : 0,
        Number.isFinite(fees) ? Number(fees.toFixed(2)) : 0,
        billedAmount > 0 ? Number(billedAmount.toFixed(2)) : 0
      ];
    });
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((x) => {
            const s = String(x ?? '');
            return s.includes(';') || s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(';')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `WEX_transactions_${dateFrom}_${dateTo}.csv`);
  };

  const kpiCards = [
    {
      label: 'Coût total',
      icon: <TrendingUp className="w-4 h-4" />,
      value: `${toFrNumber(summary?.totalAmountTTC || 0)} €`,
      variation: prevSummary
        ? ((summary?.totalAmountTTC - prevSummary?.totalAmountTTC) / Math.max(1, prevSummary?.totalAmountTTC)) * 100
        : null
    },
    {
      label: 'Volume total',
      icon: <Truck className="w-4 h-4" />,
      value: `${toFrNumber(summary?.totalLiters || 0)} L`,
      variation: prevSummary
        ? ((summary?.totalLiters - prevSummary?.totalLiters) / Math.max(1, prevSummary?.totalLiters)) * 100
        : null
    },
    {
      label: 'Prix moyen / L',
      icon: <Fuel className="w-4 h-4" />,
      value: `${Number(avgPricePerLiter).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} €/L`,
      variation: prevSummary
        ? ((avgPricePerLiter - (prevSummary?.avgPricePerLiter || 0)) / Math.max(0.0001, prevSummary?.avgPricePerLiter || 1)) * 100
        : null
    },
    {
      label: 'Nb véhicules',
      icon: <Calendar className="w-4 h-4" />,
      value: `${summary?.vehicleCount || 0}`,
      variation: null
    },
    {
      label: 'Solde compte WEX',
      icon: <Fuel className="w-4 h-4" />,
      value:
        accountSummary?.account?.availableBalance != null
          ? `${Number(accountSummary.account.availableBalance).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
          : '—',
      variation: null
    }
  ];

  const toDisplayDate = (val) => {
    if (!val) return null;
    if (typeof val === 'number' && Number.isFinite(val)) {
      const dNum = new Date(val);
      return Number.isNaN(dNum.getTime()) ? null : dNum;
    }
    let s = String(val).trim();

    // Epoch seconds (10 chiffres) / epoch ms (13 chiffres)
    if (/^\d{10}$/.test(s)) {
      const d = new Date(Number(s) * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{13}$/.test(s)) {
      const d = new Date(Number(s));
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/.test(s)) {
      s = `${s}Z`;
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  const cardsSource = accountSummary?.cards || cards;

  const allCards = cardsSource || [];
  const vehicleCards = useMemo(
    () =>
      allCards.filter((c) => {
        const lp = c?.vehicle_plate || c?.vehiclePlate || c?.licensePlate || c?.license_plate || '';
        return lp && lp !== '-' && String(lp).trim() !== '';
      }),
    [allCards]
  );
  const driverCards = useMemo(
    () =>
      allCards.filter((c) => {
        const lp = c?.vehicle_plate || c?.vehiclePlate || c?.licensePlate || c?.license_plate || '';
        return !lp || lp === '-' || String(lp).trim() === '';
      }),
    [allCards]
  );

  const filteredCards = useMemo(
    () =>
      allCards.filter((card) => {
        if (cardFilter === 'all') return true;

        const licensePlate = card?.vehicle_plate || card?.vehiclePlate || card?.licensePlate || card?.license_plate || '';
        const hasPlate = licensePlate && licensePlate !== '-' && String(licensePlate).trim() !== '';

        if (cardFilter === 'vehicle') return hasPlate;
        if (cardFilter === 'driver') return !hasPlate;

        return true;
      }),
    [allCards, cardFilter]
  );

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-red-50 via-white to-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-start gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mr-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-[#6B7280] transition-colors hover:bg-[#F0F2F6]"
            >
              ← Retour
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Fuel className="w-8 h-8 text-[#CC0000]" />
              Carburant WEX
            </h1>
            <p className="text-gray-600 mt-1">Synchronisation WEX + synthèse & transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={syncWex}
            disabled={syncing}
            className="px-4 py-2 bg-[#CC0000] text-white rounded-lg hover:bg-[#b10000] disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisation...' : '🔄 Synchroniser WEX'}
          </button>
          <div className="text-xs text-gray-500">
            {lastSync ? `Dernière synchro : ${new Date(lastSync).toLocaleString('fr-FR')}` : 'Synchro jamais effectuée'}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[200px]">
            <label className="text-xs font-semibold text-gray-600 block mb-1">Période</label>
            <select
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option value="current">Mois en cours</option>
              <option value="previous">Mois précédent</option>
              <option value="3m">3 mois</option>
              <option value="6m">6 mois</option>
              <option value="custom">Personnalisé</option>
            </select>
          </div>
          {rangeMode === 'custom' && (
            <>
              <div className="min-w-[170px]">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Du</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
              <div className="min-w-[170px]">
                <label className="text-xs font-semibold text-gray-600 block mb-1">Au</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                />
              </div>
            </>
          )}
          <div className="min-w-[240px]">
            <label className="text-xs font-semibold text-gray-600 block mb-1">Véhicule</label>
            <select
              value={vehicleFilter}
              onChange={(e) => {
                setVehicleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg"
            >
              <option value="">Tous</option>
              {vehiclesForDropdown.map((v) => (
                <option key={v.vehicle} value={v.vehicle}>
                  {v.vehicle}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black flex items-center gap-2 disabled:opacity-50"
              disabled={sortedTxs.length === 0}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {kpiCards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div className="text-gray-600 text-sm flex items-center gap-2">
                {c.icon}
                {c.label}
              </div>
              {c.variation != null && (
                <div
                  className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                    c.variation >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {c.variation >= 0 ? '+' : ''}
                  {c.variation.toFixed(1)}%
                </div>
              )}
            </div>
            <div className="mt-3 text-2xl font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Évolution mensuelle (montant TTC)</h3>
          <div className="h-[400px] min-h-[300px] w-full">
              <ResponsiveContainer width="100%" height={400} minWidth={200} minHeight={200}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" name="Montant TTC" fill="#CC0000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Top véhicules consommateurs (coût)</h3>
          <div className="h-[400px] min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height={400} minWidth={200} minHeight={200}>
              <BarChart data={vehiclesTop.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((v) => ({ ...v, name: v.vehicle }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={170} />
                <Tooltip />
                <Bar dataKey="amount" fill="#CC0000" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600" aria-hidden />
          Transactions par conducteur (montant TTC)
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Top 15 conducteurs sur la période sélectionnée — même filtre de dates que le reste de l’onglet.
        </p>
        {driversTop.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-12 text-center text-sm text-gray-500">
            Aucune transaction avec conducteur identifié sur cette période.
          </div>
        ) : (
          <div className="min-h-[300px] w-full" style={{ height: Math.max(360, driversTop.length * 40) }}>
            <ResponsiveContainer
              width="100%"
              height={Math.max(360, driversTop.length * 40)}
              minWidth={200}
              minHeight={200}
            >
              <BarChart
                data={driversTop
                  .slice()
                  .sort((a, b) => (b.amount || 0) - (a.amount || 0))
                  .map((d) => ({ ...d, name: d.driver }))}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tickFormatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} />
                <YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
                        <div className="font-semibold text-gray-900">{p.driver}</div>
                        <div className="text-gray-700">
                          Montant TTC :{' '}
                          <span className="font-medium">
                            {Number(p.amount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €
                          </span>
                        </div>
                        <div className="text-gray-600">
                          Transactions : <span className="font-medium">{p.txCount ?? 0}</span>
                        </div>
                        <div className="text-gray-600">
                          Litres :{' '}
                          <span className="font-medium">
                            {Number(p.liters || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="amount" name="Montant TTC" fill="#4F46E5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h3 className="font-semibold text-gray-900">Transactions WEX</h3>
          <div className="text-xs text-gray-500">{txTotal} lignes</div>
        </div>
        {sortedTxs.length === 0 && (
          <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
            Aucune transaction sur la période/filtre. Lance « Synchroniser WEX » pour charger les données locales.
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {[
                  ['transaction_date', 'Date'],
                  ['societeEmbossing', 'Société'],
                  ['licensePlate', 'Véhicule'],
                  ['driverName', 'Conducteur'],
                  ['locationName', 'Station'],
                  ...(hasKm ? [['odoMeter', 'Km']] : []),
                  ['productDescription', 'Produit'],
                  ['fuelQuantity', 'Litres'],
                  ['grossUnitPrice', 'Prix/L TTC'],
                  ['amountHT', 'Montant HT'],
                  ['amountTVA', 'TVA'],
                  ['amountTTC', 'Montant TTC'],
                  ['customerRebateTotal', 'Frais'],
                  ['customerAmountFacture', 'Montant facturé']
                ].map(([key, label]) => (
                  <th
                    key={key}
                    className="px-3 py-2 text-left font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort(key)}
                  >
                    {label}
                    {txSortKey === key ? (txSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedTxs.map((t, idx) => {
                // `transaction_ref` peut parfois être absent si les données locales sont incomplètes :
                // on force une clé fallback pour éviter les warnings React.
                const rowKey = t?.transaction_ref || t?.transactionRef || `${t?.transaction_date || 'no-date'}-${t?.vehicle_id || 'no-veh'}-${idx}`;
                const liters = Number(t.fuelQuantity ?? t.totalTransQuantity ?? t.quantity_liters ?? 0);
                const amountHT = Number(t.amountHT ?? t.amount_ht ?? 0);
                const amountTVA = Number(t.amountTVA ?? t.amount_tva ?? t.customerTaxAmount ?? 0);
                const amountTTC = Number(t.amountTTC ?? t.customerAmount ?? t.amount_ttc ?? 0);
                const fees = Number(t.customerRebateTotal ?? t.customer_rebate_total ?? 0);
                const billedAmount = Number(t.customerAmountFacture ?? t.customer_amount_facture ?? t.customerAmount ?? 0);

                const pricePerLiterTTC = normalizeUnitPriceTTC(t.grossUnitPrice, liters, amountTTC);
                // Le seuil de highlight se base sur la KPI moyenne calculée côté backend (prix TTC/L).
                const ttcForHighlight = liters > 0 ? amountTTC / liters : 0;
                const isHigh = ttcForHighlight > highPriceThreshold;
                return (
                  <tr key={rowKey} className={isHigh ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {toDisplayDate(t.transaction_date || t.transaction_ref)
                        ? format(toDisplayDate(t.transaction_date || t.transaction_ref), 'dd-MM-yyyy')
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{wexSocieteDisplay(t)}</td>
                    <td className="px-3 py-2 text-gray-700">{wexTransactionVehicleDisplay(t)}</td>
                    <td className="px-3 py-2 text-gray-700">{t.driverName ?? t.driver_name ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{t.locationName ?? t.site_name ?? '-'}</td>
                    {hasKm && (
                      <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                        {t.odoMeter != null && Number(t.odoMeter) > 0 ? Number(t.odoMeter).toLocaleString('fr-FR') : '-'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-700">{t.productDescription ?? t.product_type ?? '-'}</td>

                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {liters > 0 ? Number(liters).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {pricePerLiterTTC > 0 ? Number(pricePerLiterTTC).toLocaleString('fr-FR', { maximumFractionDigits: 3 }) + ' €' : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {amountHT > 0 ? Number(amountHT).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €' : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {amountTVA > 0 ? Number(amountTVA).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €' : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {amountTTC > 0 ? Number(amountTTC).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €' : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {Number.isFinite(fees) ? Number(fees).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €' : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-700 text-right whitespace-nowrap">
                      {billedAmount > 0 ? Number(billedAmount).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' €' : '-'}
                    </td>
                  </tr>
                );
              })}
              {sortedTxs.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-gray-500" colSpan={hasKm ? 14 : 13}>
                    Aucune transaction
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-4 mt-4">
          <div className="text-xs text-gray-500">
            Page {page} / {Math.max(1, Math.ceil(txTotal / limit))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ←
            </button>
            <button
              type="button"
              className="px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              disabled={page >= Math.ceil(txTotal / limit)}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Cartes WEX actives</h3>
          <button
            type="button"
            className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg"
            onClick={() => setCardsCollapsed((v) => !v)}
          >
            {cardsCollapsed ? 'Afficher' : 'Réduire'}
          </button>
        </div>
        {!cardsCollapsed && (
          <div className="overflow-x-auto">
            {cardsSource.length === 0 && (
              <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
                Aucune carte trouvée dans les données locales. Lance « Synchroniser WEX ».
              </div>
            )}
            {cardsSource.length > 0 && (
              <p className="text-xs text-gray-500 mb-2">
                Statut carte : libellés <strong>Actif</strong>, <strong>Bloquée</strong>, <strong>Expirée</strong>. Si « Statut temps réel »
                reste vide après synchro, l’API d’inventaire n’expose peut‑être pas ce champ (voir doc WEX ou les logs{' '}
                <code className="bg-gray-100 px-1 rounded">[WEX DEBUG] sample card</code>).
              </p>
            )}
            <div className="flex gap-2 mb-4 items-center">
              <button
                type="button"
                onClick={() => setCardFilter('all')}
                className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  cardFilter === 'all'
                    ? 'bg-[#CC0000] text-white border-[#CC0000]'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                Toutes ({allCards.length})
              </button>
              <button
                type="button"
                onClick={() => setCardFilter('vehicle')}
                className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  cardFilter === 'vehicle'
                    ? 'bg-[#CC0000] text-white border-[#CC0000]'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                🚛 Véhicule ({vehicleCards.length})
              </button>
              <button
                type="button"
                onClick={() => setCardFilter('driver')}
                className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  cardFilter === 'driver'
                    ? 'bg-[#CC0000] text-white border-[#CC0000]'
                    : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                👤 Conducteur ({driverCards.length})
              </button>
              {cardFilter !== 'all' && (
                <span className="text-sm text-gray-500 ml-2">
                  {filteredCards.length} carte{filteredCards.length > 1 ? 's' : ''} affichée
                  {filteredCards.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    ['card_number', 'N° carte'],
                    ['embossing_name', 'Nom / Véhicule'],
                    ['driver_name', 'Conducteur'],
                    ['card_status', 'Statut carte'],
                    ['expiry_date', 'Expiration'],
                    ['monthly_liters', 'Conso mois (L)'],
                    ['period_billed', 'Montant Période Facturé'],
                    ['online_card_status', 'Statut temps réel'],
                  ].map(([k, label]) => (
                    <th key={k} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCards.map((c, idx) => {
                  const rowKey = c?.card_number || `card-${idx}-${c?.vehicle_plate || 'no-plate'}`;
                  const cardNumber = String(c?.card_number || c?.cardNumber || '').trim();
                  const cardPeriod = cardNumber ? periodCardDetails?.[cardNumber] : null;
                  const isSelected = selectedCardNumber && cardNumber === selectedCardNumber;
                  const statusLabel = c.card_status ?? c.cardStatus ?? '';
                  const cardStatusColor =
                    statusLabel === 'Bloquée'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : statusLabel === 'Expirée'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : statusLabel === 'Actif'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-700 border-gray-200';
                  const online =
                    c.online_card_status ??
                    c.onlineCardStatus ??
                    '';
                  const onlineStr = String(online).toLowerCase();
                  const onlineColor =
                    onlineStr.includes('hors') || onlineStr.includes('offline') || onlineStr.includes('indétermin')
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : onlineStr.includes('en ligne') || onlineStr.includes('online')
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : onlineStr
                          ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200';
                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-red-50' : ''}`}
                        onClick={() => setSelectedCardNumber(isSelected ? null : cardNumber || null)}
                        title="Cliquer pour voir le détail des transactions sur la période"
                      >
                        <td className="px-3 py-2 font-medium text-gray-800 font-mono">
                          {c.card_number || c.cardNumber ? `****${String(c.card_number || c.cardNumber).slice(-4)}` : '-'}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          <div className="font-medium">{c.embossing_name || c.embossingName || '-'}</div>
                          <div className="text-xs text-gray-500">{c.vehicle_plate || c.licensePlate || '-'}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{c.driver_name || c.driverName || '-'}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 border text-xs rounded-lg ${cardStatusColor}`}
                            title={c.card_status_raw ? `WEX : ${c.card_status_raw}` : undefined}
                          >
                            {statusLabel || '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {c.expiry_date || c.expiryDate || '-'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {Number(c.monthlyLiters || 0) > 0
                            ? `${Number(c.monthlyLiters).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L`
                            : '-'}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-semibold">
                          {Number(cardPeriod?.billedAmount || 0) > 0
                            ? `${Number(cardPeriod?.billedAmount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
                            : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 border text-xs rounded-lg ${onlineColor}`}
                            title={c.online_card_status_raw ? `WEX : ${c.online_card_status_raw}` : undefined}
                          >
                            {online || '—'}
                          </span>
                        </td>
                      </tr>
                      {isSelected && (
                        <tr>
                          <td className="px-3 py-3 bg-gray-50" colSpan={8}>
                            <div className="text-xs text-gray-600 mb-2">
                              Détail période {dateFrom} → {dateTo} ({cardPeriod?.txCount || 0} transaction
                              {(cardPeriod?.txCount || 0) > 1 ? 's' : ''})
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs bg-white border border-gray-200">
                                <thead className="bg-gray-100">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Date</th>
                                    <th className="px-2 py-1 text-left">Conducteur</th>
                                    <th className="px-2 py-1 text-left">Station</th>
                                    <th className="px-2 py-1 text-left">Produit</th>
                                    <th className="px-2 py-1 text-right">Litres</th>
                                    <th className="px-2 py-1 text-right">Montant TTC</th>
                                    <th className="px-2 py-1 text-right">Frais</th>
                                    <th className="px-2 py-1 text-right">Montant facturé</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {(cardPeriod?.transactions || []).map((tx, txIdx) => (
                                    <tr key={`${rowKey}-tx-${txIdx}`}>
                                      <td className="px-2 py-1 whitespace-nowrap">
                                        {toDisplayDate(tx.transaction_date || tx.transaction_ref)
                                          ? format(toDisplayDate(tx.transaction_date || tx.transaction_ref), 'dd-MM-yyyy')
                                          : '-'}
                                      </td>
                                      <td className="px-2 py-1">{tx.driverName || '-'}</td>
                                      <td className="px-2 py-1">{tx.station || '-'}</td>
                                      <td className="px-2 py-1">{tx.product || '-'}</td>
                                      <td className="px-2 py-1 text-right">{Number(tx.liters || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
                                      <td className="px-2 py-1 text-right">{Number(tx.amountTTC || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</td>
                                      <td className="px-2 py-1 text-right">{Number(tx.fees || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</td>
                                      <td className="px-2 py-1 text-right">{Number(tx.billedAmount || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €</td>
                                    </tr>
                                  ))}
                                  {(cardPeriod?.transactions || []).length === 0 && (
                                    <tr>
                                      <td className="px-2 py-2 text-center text-gray-500" colSpan={8}>
                                        Aucune transaction pour cette carte sur la période
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredCards.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-gray-500" colSpan={8}>
                      Aucune carte
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default FuelTab;


import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import API_BASE from '../../../config/api';
function typeMeta(type) {
  if (type === 'speeding') return { icon: '🚨', label: 'Excès vitesse', hex: '#ef4444' };
  if (type === 'idling') return { icon: '😴', label: 'Ralenti prolongé', hex: '#f97316' };
  if (type === 'low_fuel') return { icon: '⛽', label: 'Carburant bas', hex: '#eab308' };
  return { icon: '🔧', label: 'Panne/Malfonction', hex: '#991b1b' };
}

function normalizeGrouped(payload, list) {
  const zero = { speeding: 0, idling: 0, low_fuel: 0, malfunction: 0 };
  const byType = payload?.summary?.byType;
  if (byType && typeof byType === 'object' && !Array.isArray(byType)) {
    return {
      speeding: Number(byType.speeding ?? 0),
      idling: Number(byType.idling ?? 0),
      low_fuel: Number(byType.low_fuel ?? 0),
      malfunction: Number(byType.malfunction ?? 0),
    };
  }
  const g = payload?.grouped;

  if (g && typeof g === 'object' && !Array.isArray(g)) {
    return {
      speeding: Number(g.speeding ?? 0),
      idling: Number(g.idling ?? 0),
      low_fuel: Number(g.low_fuel ?? 0),
      malfunction: Number(g.malfunction ?? 0),
    };
  }

  if (Array.isArray(g)) {
    const out = { ...zero };
    for (const row of g) {
      const key = String(row?.alert_type || row?.type || '').toLowerCase();
      const n = Number(row?.count ?? row?.n ?? 0);
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = n;
    }
    return out;
  }

  // Fallback robuste: calcule depuis la liste d'alertes brute.
  return (Array.isArray(list) ? list : []).reduce((acc, a) => {
    const key = String(a?.alert_type || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(acc, key)) acc[key] += 1;
    return acc;
  }, { ...zero });
}

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('fr-FR');
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

export function WebfleetAlerts() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');

  const todayQ = useQuery({
    queryKey: ['webfleet-alerts-today'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/webfleet/alerts/today`);
      if (!res.ok) throw new Error('alerts_today');
      const payload = await res.json();
      console.log('[WebfleetAlerts] /alerts/today raw:', payload);
      return payload;
    },
    refetchInterval: 30_000,
  });

  const list = Array.isArray(todayQ.data?.data) ? todayQ.data.data : [];
  const grouped = useMemo(() => normalizeGrouped(todayQ.data, list), [todayQ.data, list]);
  const filtered = useMemo(() => {
    if (typeFilter === 'all') return list;
    return list.filter((a) => String(a.alert_type) === typeFilter);
  }, [list, typeFilter]);

  const handleCardClick = (type) => {
    if (typeFilter === type) {
      setTypeFilter('all');
      return;
    }
    setTypeFilter(type);
    setOpen(true);
  };

  const ackOne = async (id) => {
    await fetch(`${API_BASE}/api/webfleet/alerts/${id}/acknowledge`, { method: 'PATCH' });
    await queryClient.invalidateQueries({ queryKey: ['webfleet-alerts-today'] });
  };

  const ackAll = async () => {
    await fetch(`${API_BASE}/api/webfleet/alerts/acknowledge-all`, { method: 'POST' });
    await queryClient.invalidateQueries({ queryKey: ['webfleet-alerts-today'] });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-800">Alertes Webfleet</h2>
      <div className="grid gap-3 md:grid-cols-4">
        {['speeding', 'idling', 'low_fuel', 'malfunction'].map((k) => {
          const meta = typeMeta(k);
          const n = Number(grouped[k] || 0);
          const isActive = typeFilter === k;
          const zero = n === 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => handleCardClick(k)}
              className={`rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                isActive ? 'border-slate-900 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-2xl leading-none">{meta.icon}</div>
              <div
                className="mt-2 text-3xl font-bold"
                style={{ color: zero ? '#94a3b8' : meta.hex }}
              >
                {n}
              </div>
              <div className={`mt-1 text-xs font-medium ${zero ? 'text-slate-400' : 'text-slate-600'}`}>
                {meta.label}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
        >
          {open ? 'Masquer les alertes' : 'Voir toutes les alertes'}
        </button>
        {open && (
          <>
            <button
              type="button"
              onClick={ackAll}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-800"
            >
              Tout acquitter
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          {typeFilter !== 'all' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <span>Filtre actif : {typeMeta(typeFilter).label}</span>
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className="rounded border border-blue-300 bg-white px-2 py-0.5 text-xs text-blue-800"
              >
                ✕
              </button>
            </div>
          )}
          {todayQ.isFetching && (
            <p className="text-xs text-slate-500">Actualisation des alertes...</p>
          )}
          {!filtered.length ? (
            <div className="rounded-lg border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
              Aucune alerte non acquittée aujourd'hui.
            </div>
          ) : (
            filtered.map((a) => {
              const m = typeMeta(a.alert_type);
              return (
                <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold" style={{ color: m.hex }}>{m.icon} {m.label}</div>
                      <div className="text-slate-800">{a.objectname || a.objectno} {a.drivername ? `· ${a.drivername}` : ''}</div>
                      <div className="text-xs text-slate-500">{fmtTime(a.msg_time)} · {a.msg_text || 'Alerte détectée'}</div>
                      {a.pos_text && <div className="text-xs text-slate-600">{a.pos_text}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => ackOne(a.id)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      ✓ Acquitter
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

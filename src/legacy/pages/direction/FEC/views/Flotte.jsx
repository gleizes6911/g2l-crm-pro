import { useCallback, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import AlertBanner from '../components/AlertBanner'
import DataTable from '../components/DataTable'
import DrillDownModal, { DRILL_COLUMNS_BASE } from '../components/DrillDownModal'
import { doughnutOptions } from './common'
import { fmt, fmtK, pct } from '../utils/formatters'
import { rawToDrillDisplay, filterFlotteImmat, monthDebitTotals, yyyymmToLabel } from '../utils/fecDrillHelpers'

function typeBadge(typ) {
  const k = typ === 'CRÉDIT-BAIL' || typ === 'CB' ? 'CB' : typ
  const cls = { LLD: 'fec-badge-typ--lld', LOA: 'fec-badge-typ--loa', CB: 'fec-badge-typ--cb', AUTRE: 'fec-badge-typ--autre' }[k] || 'fec-badge-typ--autre'
  return <span className={`fec-badge-typ ${cls}`}>{typ}</span>
}

export default function Flotte({ c, hasMulti, go, fecPeriod }) {
  const fecRows = c.fecRows || []
  const [drill, setDrill] = useState(null)

  const byT = { LLD: [], CB: [], LOA: [], AUTRE: [] }
  c.vehs.forEach((v) => {
    const k = v.typ === 'CB' || v.typ === 'CRÉDIT-BAIL' ? 'CB' : v.typ
    ;(byT[k] = byT[k] || []).push(v)
  })
  const tLLD = (byT.LLD || []).reduce((s, v) => s + v.montant, 0)
  const tCB = (byT.CB || []).reduce((s, v) => s + v.montant, 0)
  const tLOA = (byT.LOA || []).reduce((s, v) => s + v.montant, 0)
  const tAut = (byT.AUTRE || []).reduce((s, v) => s + v.montant, 0)
  const tot = tLLD + tCB + tLOA + tAut
  const loyers = Object.entries(c.byCp)
    .filter(([k]) => k.startsWith('613') && (c.byCp[k].lib || '').toUpperCase().includes('LOYER'))
    .map(([k, v]) => ({ cp: k, lib: v.lib, m: v.debit - v.credit }))
    .filter((v) => v.m > 0)
    .sort((a, b) => b.m - a.m)
  const tLoy = loyers.reduce((s, v) => s + v.m, 0)
  const byFin = {}
  c.vehs.forEach((v) => { byFin[v.fin] = (byFin[v.fin] || 0) + v.montant })

  const openVehiculeDrill = useCallback((v) => {
    const raw = filterFlotteImmat(fecRows, v.immat)
    const totals = monthDebitTotals(raw)
    const footer = (
      <div>
        <strong>Totaux débit par mois</strong>
        <table className="fec-table" style={{ marginTop: 8, fontSize: 12 }}>
          <tbody>
            {totals.map(([m, amt]) => (
              <tr key={m} className="fec-tr">
                <td className="fec-td">{yyyymmToLabel(m)}</td>
                <td className="fec-td fec-num">{fmt(amt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    setDrill({
      title: `Écritures flotte — ${v.immat}`,
      subtitle: `Coût annuel : ${fmt(v.montant)} | Financeur : ${v.fin} | Type : ${v.typ}`,
      rows: raw.map((r) => rawToDrillDisplay(r)),
      footer,
    })
  }, [fecRows])

  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="🚗 Flotte LLD · LOA · CB" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg fec-kg--5">
        <KpiCard label="Total flotte véhicules" value={fmtK(tot)} delta={`${c.vehs.length} véhicules`} />
        <KpiCard label="LLD" value={<span style={{ color: 'var(--fec-green)' }}>{fmtK(tLLD)}</span>} delta={`${(byT.LLD || []).length} vhs · ${pct(tLLD, tot)}`} />
        <KpiCard label="Crédit-bail" value={<span style={{ color: 'var(--fec-orange)' }}>{fmtK(tCB)}</span>} delta={`${(byT.CB || []).length} vhs · ${pct(tCB, tot)}`} />
        <KpiCard label="LOA" value={<span style={{ color: 'var(--fec-accent)' }}>{fmtK(tLOA)}</span>} delta={`${(byT.LOA || []).length} vhs · ${pct(tLOA, tot)}`} />
        <KpiCard label="Loyers immobiliers" value={fmtK(tLoy)} delta={`${loyers.length} sites`} />
      </div>
      <div className="fec-ar">
        <AlertBanner type="info" title={`ℹ Flotte+Loyers = ${pct(tot + tLoy, c.ca)} du CA`} body={`Coût total fixe location : ${fmt(tot + tLoy)}`} />
        <AlertBanner type="warn" title={`⚠ Loc Center = ${pct(byFin['Loc Center'] || 0, tot)} de la flotte LLD`} body="Concentration forte sur un seul loueur." />
        <AlertBanner type="warn" title={`⚠ Loyers immobiliers = ${fmt(tLoy)}/an`} body={`${loyers.length} sites.`} />
      </div>
      <div className="fec-cr">
        <div className="fec-card">
          <DataTable
            headers={[
              { key: 'immat', label: 'Immat.' },
              { key: 'typ', label: 'Type' },
              { key: 'fin', label: 'Financeur' },
              { key: 'm', label: 'Coût annuel', className: 'fec-num' },
              { key: 'mois', label: 'Moy/mois', className: 'fec-num' },
              { key: 'detail', label: 'Détail' },
            ]}
            rows={c.vehs.slice().sort((a, b) => b.montant - a.montant).map((v) => ({
              meta: v,
              immat: <span className="fec-immat">{v.immat}</span>,
              typ: typeBadge(v.typ),
              fin: v.fin,
              m: fmt(v.montant),
              mois: fmt(v.montant / 12),
              detail: (
                <button type="button" className="fec-drill-mini" title="Cliquer pour voir le détail" onClick={(e) => { e.stopPropagation(); openVehiculeDrill(v) }}>
                  → Voir<span className="fec-drill-ico"> 🔍</span>
                </button>
              ),
            }))}
            totalRow={{ immat: 'TOTAL', m: fmt(tot), mois: fmt(tot / 12), detail: '' }}
            onRowClick={(r) => r.meta && openVehiculeDrill(r.meta)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="fec-card">
            <div className="fec-chart fec-chart-flotte-donut">
              <Doughnut data={{ labels: ['LLD', 'Crédit-bail', 'LOA', 'Autre'], datasets: [{ data: [tLLD, tCB, tLOA, tAut], backgroundColor: ['#16a34a', '#ea580c', '#2563eb', '#94a3b8'] }] }} options={doughnutOptions} />
            </div>
          </div>
          <div className="fec-card">
            {Object.entries(byFin).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([f, m]) => (
              <div key={f} className="fec-pw">
                <div className="fec-ph">
                  <span className="fec-pl">{f}</span>
                  <span className="fec-pv">{fmt(m)}</span>
                </div>
                <div className="fec-pb">
                  <div className="fec-pf" style={{ width: `${Math.min(100, (m / tot) * 100)}%`, background: 'var(--fec-accent)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="fec-card">
        <DataTable headers={[{ key: 'cp', label: 'Compte' }, { key: 'lib', label: 'Site' }, { key: 'm', label: 'Annuel', className: 'fec-num' }, { key: 'mois', label: 'Moy/mois', className: 'fec-num' }, { key: 'p', label: '%', className: 'fec-pc' }]} rows={loyers.map((l) => ({ cp: l.cp, lib: l.lib, m: fmt(l.m), mois: fmt(l.m / 12), p: pct(l.m, tLoy) }))} totalRow={{ cp: 'TOTAL loyers', m: fmt(tLoy), mois: fmt(tLoy / 12), p: '100%' }} />
      </div>

      {drill ? (
        <DrillDownModal
          title={drill.title}
          subtitle={drill.subtitle}
          rows={drill.rows}
          columns={DRILL_COLUMNS_BASE}
          exportFileBase={c.name}
          footer={drill.footer}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  )
}

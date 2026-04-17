import { useCallback, useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import ViewTopBar from '../components/ViewTopBar'
import KpiCard from '../components/KpiCard'
import AlertBanner from '../components/AlertBanner'
import DataTable from '../components/DataTable'
import DrillDownModal, { DRILL_COLUMNS_BASE } from '../components/DrillDownModal'
import { barOptions, doughnutOptions } from './common'
import { fmt, fmtK, pct, pn } from '../utils/formatters'
import { MN } from '../utils/constants'
import { rawToDrillDisplay, filterCaMonthClass7, yyyymmToLabel } from '../utils/fecDrillHelpers'

/** Drill-down : compteNums (client agrégé par nom) ou clé = CompteNum (données anciennes). */
function rowsForCompte(fecRows, keyOrCp, v) {
  if (Array.isArray(v?.compteNums) && v.compteNums.length) {
    const set = new Set(v.compteNums.map(String))
    return fecRows.filter((r) => set.has(String(r.CompteNum)))
  }
  return fecRows.filter((r) => String(r.CompteNum) === String(keyOrCp))
}

function rowsForCompteMonth(fecRows, keyOrCp, v, yyyymm) {
  const y = String(yyyymm)
  return rowsForCompte(fecRows, keyOrCp, v).filter((r) => String(r.EcritureDate || '').startsWith(y))
}

export default function Clients({ c, hasMulti, go, fecPeriod }) {
  const fecRows = c.fecRows || []
  const [drill, setDrill] = useState(null)

  const ca = Object.entries(c.cl).filter(([, v]) => v.brut > 0).sort((a, b) => b[1].brut - a[1].brut)
  const tB = ca.reduce((s, [, v]) => s + v.brut, 0)
  const tA = ca.reduce((s, [, v]) => s + v.avoirs, 0)
  const tL = Object.values(c.litC).reduce((s, v) => s + v, 0)
  const aM = ca.flatMap(([, v]) => Object.keys(v.men)).filter((v, i, arr) => arr.indexOf(v) === i).sort()
  const donutTop = ca.slice(0, 8)
  const rest = ca.slice(8).reduce((s, [, v]) => s + v.brut, 0)
  const donutLabels = donutTop.map(([, v]) => v.nom).concat(rest > 0 ? ['Autres'] : [])
  const donutData = donutTop.map(([, v]) => Math.round(v.brut)).concat(rest > 0 ? [Math.round(rest)] : [])
  const donutColors = donutTop.map(([, v]) => v.c).concat(rest > 0 ? ['#94a3b8'] : [])

  const top1 = ca[0]?.[1]
  const top2Brut = (ca[0]?.[1]?.brut || 0) + (ca[1]?.[1]?.brut || 0)
  const concTop1 = tB > 0 && top1 ? top1.brut / tB : 0

  const openClientDrill = useCallback((clientKey, v) => {
    const raw = rowsForCompte(fecRows, clientKey, v)
    const lib = v.libComplet || v.nom
    const cps = Array.isArray(v?.compteNums) && v.compteNums.length ? v.compteNums.join(', ') : clientKey
    setDrill({
      title: `Écritures — Compte(s) ${cps} — ${lib}`,
      subtitle: `${v.nom} · CA brut : ${fmt(v.brut)} | Avoirs : ${fmt(v.avoirs)} | CA net : ${fmt(v.brut - v.avoirs)}`,
      rows: raw.map((r) => rawToDrillDisplay(r)),
    })
  }, [fecRows])

  const openClientMonthDrill = useCallback((clientKey, v, yyyymm) => {
    const raw = rowsForCompteMonth(fecRows, clientKey, v, yyyymm)
    const lib = v.libComplet || v.nom
    const cps = Array.isArray(v?.compteNums) && v.compteNums.length ? v.compteNums.join(', ') : clientKey
    setDrill({
      title: `Compte(s) ${cps} — ${lib} — ${yyyymmToLabel(yyyymm)}`,
      subtitle: `${v.nom} · ${raw.length} écriture(s)`,
      rows: raw.map((r) => rawToDrillDisplay(r)),
    })
  }, [fecRows])

  const openCaMonthBarDrill = useCallback((yyyymm) => {
    const raw = filterCaMonthClass7(fecRows, yyyymm)
    const total = raw.reduce((s, r) => s + (pn(r.Credit) - pn(r.Debit)), 0)
    setDrill({
      title: `CA — ${yyyymmToLabel(yyyymm)}`,
      subtitle: `Total : ${fmt(total)} · Comptes 7xxxxx`,
      rows: raw.map((r) => rawToDrillDisplay(r, { includeMois: false })),
    })
  }, [fecRows])

  const barOpts = useMemo(() => barOptions({
    plugins: { legend: { display: true, labels: { color: '#475569' } } },
    onClick: (_evt, els) => {
      if (!els?.length) return
      const idx = els[0].index
      if (idx < 0 || idx >= aM.length) return
      openCaMonthBarDrill(aM[idx])
    },
  }), [aM, openCaMonthBarDrill])

  return (
    <div className="fec-ct">
      <ViewTopBar company={c} badge="🏢 CA & clients" onMulti={hasMulti ? () => go('comp') : null} fecPeriod={fecPeriod} />
      <div className="fec-kg fec-kg--5">
        <KpiCard label="CA brut total" value={fmtK(tB)} delta={`${ca.length} clients`} />
        <KpiCard label="Avoirs & remises" value={<span style={{ color: 'var(--fec-orange)' }}>{fmtK(tA)}</span>} delta={`${pct(tA, tB)} du brut`} />
        <KpiCard label="CA net" value={<span style={{ color: 'var(--fec-green)' }}>{fmtK(tB - tA)}</span>} delta="Après avoirs" />
        <KpiCard label="Litiges colis" value={<span style={{ color: 'var(--fec-red)' }}>{fmtK(tL)}</span>} delta={`${pct(tL, tB)} du CA`} />
        <KpiCard label="CA net réel" value={fmtK(tB - tA - tL)} delta="Marge réelle transporteur" />
      </div>
      <div className="fec-ar">
        <AlertBanner type={concTop1 > 0.22 ? 'warn' : 'ok'} title={`${concTop1 > 0.22 ? '⚠' : '✓'} Concentration ${top1?.nom || '1er client'} = ${pct(top1?.brut || 0, tB)}`} body="Risque élevé si perte d'un compte clé." />
        <AlertBanner type={(tL / tB) > 0.015 ? 'warn' : 'ok'} title={`${(tL / tB) > 0.015 ? '⚠' : '✓'} Taux de litige = ${pct(tL, tB)}`} body="Impact direct sur marge nette." />
        <AlertBanner type="info" title={`ℹ Part cumulée des 2 plus gros clients = ${pct(top2Brut, tB)}`} body="Indicateur de concentration du chiffre d'affaires." />
      </div>
      <p className="fec-ct-s" style={{ marginTop: 0, marginBottom: 8 }} title="Cliquer sur une ligne ou sur « Voir » pour le détail des écritures.">
        Graphique empilé : cliquer sur une barre pour le détail CA du mois (comptes 7xx).
      </p>
      <div className="fec-card" style={{ marginBottom: 16 }}>
        <DataTable
          headers={[
            { key: 'client', label: 'Client' },
            { key: 'caBrut', label: 'CA brut', className: 'fec-num' },
            { key: 'avoirs', label: 'Avoirs', className: 'fec-num' },
            { key: 'caNet', label: 'CA net', className: 'fec-num' },
            { key: 'litiges', label: 'Litiges', className: 'fec-num' },
            { key: 'caNetReel', label: 'CA net réel', className: 'fec-num' },
            { key: 'part', label: 'Part CA', className: 'fec-pc' },
            { key: 'taux', label: 'Taux litige', className: 'fec-pc' },
            { key: 'detail', label: 'Détail' },
          ]}
          rows={ca.map(([k, v]) => {
            const lit = c.litC[v.nom] || 0
            const net = v.brut - v.avoirs
            return {
              meta: { k, v },
              client: v.nom,
              caBrut: fmt(v.brut),
              avoirs: v.avoirs > 0 ? `-${fmt(v.avoirs)}` : '—',
              caNet: fmt(net),
              litiges: lit > 0 ? `-${fmt(lit)}` : '—',
              caNetReel: fmt(net - lit),
              part: pct(v.brut, tB),
              taux: lit > 0 ? pct(lit, v.brut) : '—',
              detail: (
                <button
                  type="button"
                  className="fec-drill-mini"
                  title="Cliquer pour voir le détail"
                  onClick={(e) => { e.stopPropagation(); openClientDrill(k, v) }}
                >
                  → Voir<span className="fec-drill-ico"> 🔍</span>
                </button>
              ),
            }
          })}
          totalRow={{ client: 'TOTAL', caBrut: fmt(tB), avoirs: tA > 0 ? `-${fmt(tA)}` : '—', caNet: fmt(tB - tA), litiges: `-${fmt(tL)}`, caNetReel: fmt(tB - tA - tL), part: '100%', taux: pct(tL, tB), detail: '' }}
          onRowClick={(r) => r.meta && openClientDrill(r.meta.k, r.meta.v)}
        />
      </div>
      <div className="fec-cr">
        <div className="fec-card">
          <div className="fec-chart fec-chart-clients">
            <Bar data={{ labels: aM.map((m) => MN[parseInt(m.slice(4, 6), 10)]), datasets: ca.slice(0, 6).map(([, v]) => ({ label: v.nom, data: aM.map((m) => Math.round(v.men[m] || 0)), backgroundColor: `${v.c}D9`, stack: 's' })) }} options={barOpts} />
          </div>
        </div>
        <div className="fec-card">
          <div className="fec-chart fec-chart-clients">
            <Doughnut data={{ labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors }] }} options={doughnutOptions} />
          </div>
        </div>
      </div>
      <div className="fec-card">
        <div className="fec-tw">
          <table className="fec-table fec-table--monthly">
            <thead>
              <tr>
                <th className="fec-th">Client</th>
                {aM.map((m) => (
                  <th key={m} className="fec-th fec-num" title="Cliquer une cellule pour le détail mois + client">
                    {MN[parseInt(m.slice(4, 6), 10)]}
                  </th>
                ))}
                <th className="fec-th fec-num">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {ca.map(([k, v]) => (
                <tr key={k} className="fec-tr">
                  <td className="fec-td">{v.nom}</td>
                  {aM.map((m) => (
                    <td
                      key={m}
                      className="fec-td fec-num fec-month-cell-drill"
                      title="Cliquer pour voir le détail"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openClientMonthDrill(k, v, m) } }}
                      onClick={() => openClientMonthDrill(k, v, m)}
                    >
                      {v.men[m] ? Math.round(v.men[m]).toLocaleString('fr-FR') : '—'}
                    </td>
                  ))}
                  <td className="fec-td fec-num">{fmt(v.brut)}</td>
                </tr>
              ))}
              <tr className="fec-rt">
                <td className="fec-td">TOTAL</td>
                {aM.map((m) => (
                  <td key={m} className="fec-td fec-num">
                    {Math.round(ca.reduce((s, [, row]) => s + (row.men[m] || 0), 0)).toLocaleString('fr-FR')}
                  </td>
                ))}
                <td className="fec-td fec-num">{fmt(tB)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {drill ? (
        <DrillDownModal
          title={drill.title}
          subtitle={drill.subtitle}
          rows={drill.rows}
          columns={DRILL_COLUMNS_BASE}
          exportFileBase={c.name}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  )
}

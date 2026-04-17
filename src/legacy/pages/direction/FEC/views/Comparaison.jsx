import { useEffect, useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import DataTable from '../components/DataTable'
import KpiCard from '../components/KpiCard'
import { barOptions } from './common'
import { fmt, pct } from '../utils/formatters'
import { companyAccent } from '../utils/fecColors'
import { analyzeFecRows } from '../utils/parseFEC'

function flatForExercise(co, year) {
  const ex = co.exercices?.find((e) => e.annee === year)
  if (!ex) return null
  const rows = ex.rows || []
  return analyzeFecRows(rows, co.name, year, { siren: co.siren || '', companyId: co.id })
}

const ROW_DEFS = [
  ['CA', (c) => fmt(c.ca)],
  ['Charges', (c) => fmt(c.ch6)],
  ['Résultat net', (c) => fmt(c.rNet)],
  ['Marge nette', (c) => `${c.mNet.toFixed(1)}%`],
  ['Masse sal.', (c) => fmt(c.massSal)],
  ['Sal./CA', (c) => pct(c.massSal, c.ca)],
  ['Flotte', (c) => fmt(c.tFlot)],
  ['Flotte/CA', (c) => pct(c.tFlot, c.ca)],
  ['Nb salariés', (c) => Object.keys(c.sals).length],
  ['Nb véhicules', (c) => c.vehs.length],
  ['Pénalités', (c) => fmt(c.pens.reduce((s, p) => s + p.montant, 0))],
  ['Litiges', (c) => fmt(Object.values(c.litC).reduce((s, v) => s + v, 0))],
  ['IS', (c) => fmt(c.is)],
  ['TVA décaissée', (c) => fmt(c.tvaA)],
]

export default function Comparaison({ companies, activeCompanyId, setActiveCompanyId, buildFlatCompanyView, onImport }) {
  const [mode, setMode] = useState('companies')
  const [yearCoOverride, setYearCoOverride] = useState(null)
  const [selectedYears, setSelectedYears] = useState([])

  const flatCompanies = useMemo(
    () => companies.map((co) => buildFlatCompanyView(co)).filter(Boolean),
    [companies, buildFlatCompanyView],
  )

  const companiesWithMultiEx = useMemo(
    () => companies.filter((c) => (c.exercices || []).length >= 2),
    [companies],
  )

  const yearCo = useMemo(() => {
    if (mode !== 'years') return null
    const want = yearCoOverride ?? activeCompanyId
    return companiesWithMultiEx.find((c) => c.id === want) || companiesWithMultiEx[0] || null
  }, [mode, companiesWithMultiEx, yearCoOverride, activeCompanyId])

  const yearsOpts = useMemo(() => {
    if (!yearCo?.exercices?.length) return []
    return [...yearCo.exercices].map((e) => e.annee).sort((a, b) => b - a)
  }, [yearCo])

  useEffect(() => {
    if (mode !== 'years') return
    setSelectedYears((prev) => {
      const valid = prev.filter((y) => yearsOpts.includes(y))
      if (valid.length >= 2) return valid.sort((a, b) => b - a)
      return yearsOpts.slice(0, Math.min(2, yearsOpts.length))
    })
  }, [mode, yearsOpts, yearCo?.id])

  const toggleYear = (y) => {
    setSelectedYears((prev) => {
      if (prev.includes(y)) {
        if (prev.length <= 1) return prev
        return prev.filter((x) => x !== y).sort((a, b) => b - a)
      }
      return [...prev, y].sort((a, b) => b - a)
    })
  }

  const yearsSortedAsc = useMemo(() => [...selectedYears].sort((a, b) => a - b), [selectedYears])

  const yearSlices = useMemo(() => {
    if (!yearCo || mode !== 'years') return []
    return yearsSortedAsc
      .map((y) => {
        const flat = flatForExercise(yearCo, y)
        return flat ? { y, flat } : null
      })
      .filter(Boolean)
  }, [yearCo, mode, yearsSortedAsc])

  const barOpts = barOptions({ plugins: { legend: { display: true, labels: { color: '#475569' } } } })

  const modeToggle = (
    <div className="fec-comp-toolbar">
      <div className="fec-comp-mode" role="tablist" aria-label="Mode de comparaison">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'companies'}
          className={mode === 'companies' ? 'fec-comp-mode--active' : ''}
          onClick={() => setMode('companies')}
        >
          Comparer sociétés
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'years'}
          className={mode === 'years' ? 'fec-comp-mode--active' : ''}
          onClick={() => setMode('years')}
        >
          Comparer années
        </button>
      </div>
    </div>
  )

  if (mode === 'companies' && flatCompanies.length < 2) {
    return (
      <div className="fec-ct">
        {modeToggle}
        <div className="fec-empty">
          <div>Importer au moins 2 sociétés pour comparer les entités entre elles.</div>
          <button type="button" className="fec-btn" onClick={onImport}>
            + Importer
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'years' && companiesWithMultiEx.length === 0) {
    return (
      <div className="fec-ct">
        {modeToggle}
        <div className="fec-empty">
          <div>
            Importez au moins deux fichiers FEC pour une même société pour activer la comparaison inter-années.
          </div>
          <button type="button" className="fec-btn" onClick={onImport}>
            + Importer
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'companies') {
    return (
      <div className="fec-ct">
        {modeToggle}
        <div className="fec-kg">
          {flatCompanies.map((c, i) => (
            <KpiCard
              key={c.id}
              label={c.name}
              value={fmt(c.rNet)}
              delta={`Marge ${c.mNet.toFixed(1)}%`}
              onClick={() => setActiveCompanyId(c.id)}
              accentColor={companyAccent(c.id, i)}
            />
          ))}
        </div>
        <div className="fec-card" style={{ marginBottom: 14 }}>
          <div className="fec-chart fec-chart-comp">
            <Bar
              data={{
                labels: flatCompanies.map((c) => c.name),
                datasets: [
                  { label: 'CA', data: flatCompanies.map((c) => Math.round(c.ca)), backgroundColor: '#2563ebD9' },
                  { label: 'Charges', data: flatCompanies.map((c) => Math.round(c.ch6)), backgroundColor: '#dc2626D9' },
                  { label: 'Résultat', data: flatCompanies.map((c) => Math.round(c.rNet)), backgroundColor: '#16a34aD9' },
                ],
              }}
              options={barOpts}
            />
          </div>
        </div>
        <div className="fec-card">
          <DataTable
            headers={[
              { key: 'k', label: 'Indicateur' },
              ...flatCompanies.map((c, i) => ({
                key: String(c.id),
                label: c.name,
                className: 'fec-num fec-th--company',
              })),
            ]}
            rows={ROW_DEFS.map(([k, fn]) => ({
              k,
              ...Object.fromEntries(flatCompanies.map((c) => [String(c.id), fn(c)])),
            }))}
          />
        </div>
      </div>
    )
  }

  /* mode === 'years' */
  return (
    <div className="fec-ct">
      {modeToggle}
      <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--fec-text2)' }} htmlFor="fec-comp-year-co2">
          Société
        </label>
        <select
          id="fec-comp-year-co2"
          className="fec-fi"
          style={{ minWidth: 220 }}
          value={yearCo?.id || ''}
          onChange={(e) => setYearCoOverride(e.target.value)}
        >
          {companies
            .filter((c) => (c.exercices || []).length >= 2)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--fec-text3)' }}>
        Sélectionnez au moins deux exercices à comparer (clic pour activer / désactiver).
      </p>
      <div className="fec-comp-year-chips" style={{ marginBottom: 16 }}>
        {yearsOpts.map((y) => (
          <button
            key={y}
            type="button"
            className={`fec-comp-year-chip ${selectedYears.includes(y) ? 'fec-comp-year-chip--on' : ''}`}
            onClick={() => toggleYear(y)}
          >
            {y}
          </button>
        ))}
      </div>
      {selectedYears.length < 2 ? (
        <div className="fec-empty" style={{ minHeight: 120 }}>
          <div>Sélectionnez au moins deux années.</div>
        </div>
      ) : (
        <>
          <div className="fec-card" style={{ marginBottom: 14 }}>
            <div className="fec-ct-t" style={{ marginBottom: 8 }}>
              CA, charges et résultat par exercice — {yearCo?.name}
            </div>
            <div className="fec-chart fec-chart-comp">
              <Bar
                data={{
                  labels: yearSlices.map((s) => String(s.y)),
                  datasets: [
                    { label: 'CA', data: yearSlices.map((s) => Math.round(s.flat.ca)), backgroundColor: '#2563ebD9' },
                    {
                      label: 'Charges',
                      data: yearSlices.map((s) => Math.round(s.flat.ch6)),
                      backgroundColor: '#dc2626D9',
                    },
                    {
                      label: 'Résultat',
                      data: yearSlices.map((s) => Math.round(s.flat.rNet)),
                      backgroundColor: '#16a34aD9',
                    },
                  ],
                }}
                options={barOpts}
              />
            </div>
          </div>
          <div className="fec-card" style={{ marginBottom: 14 }}>
            <div className="fec-ct-t" style={{ marginBottom: 8 }}>
              Évolution CA et résultat net
            </div>
            <div className="fec-chart fec-chart-comp">
              <Line
                data={{
                  labels: yearSlices.map((s) => String(s.y)),
                  datasets: [
                    {
                      label: 'CA',
                      data: yearSlices.map((s) => Math.round(s.flat.ca)),
                      borderColor: '#2563eb',
                      backgroundColor: 'rgba(37, 99, 235, 0.12)',
                      fill: false,
                      tension: 0.25,
                    },
                    {
                      label: 'Résultat net',
                      data: yearSlices.map((s) => Math.round(s.flat.rNet)),
                      borderColor: '#16a34a',
                      backgroundColor: 'rgba(22, 163, 74, 0.12)',
                      fill: false,
                      tension: 0.25,
                    },
                  ],
                }}
                options={barOpts}
              />
            </div>
          </div>
          <div className="fec-card">
            <DataTable
              headers={[
                { key: 'k', label: 'Indicateur' },
                ...yearSlices.map((s) => ({
                  key: `y${s.y}`,
                  label: String(s.y),
                  className: 'fec-num fec-th--company',
                })),
              ]}
              rows={ROW_DEFS.map(([k, fn]) => ({
                k,
                ...Object.fromEntries(yearSlices.map((s) => [`y${s.y}`, fn(s.flat)])),
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const PAGE = 'a4'
const LAND = 'l'
const M = 14

/** Espaces entre milliers (évite NNBSP / U+202F mal rendus en « / » en PDF). */
export function formatEurPdf(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Math.round(Number(n))
  const s = v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${s} €`
}

function pageMetrics(doc) {
  return {
    w: doc.internal.pageSize.getWidth(),
    h: doc.internal.pageSize.getHeight(),
    contentW: doc.internal.pageSize.getWidth() - 2 * M,
  }
}

/** Résout l’ID société vers le libellé (FEC) pour les PDF. */
function societeLibelle(societes, id) {
  if (id == null || id === '') return '—'
  const s = (societes || []).find((x) => String(x.id) === String(id))
  if (s?.nom) {
    return String(s.nom).length > 42 ? `${String(s.nom).slice(0, 40)}…` : String(s.nom)
  }
  return `Société #${id}`
}

function slug(s) {
  return String(s || 'rapport')
    .replace(/[^\w\- àâäéèêëïîôùûüç.]+/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 50)
}

function newPageIfNeeded(doc, y, needMm = 36) {
  const { h } = pageMetrics(doc)
  if (y + needMm > h - M) {
    doc.addPage(PAGE, LAND)
    return M + 6
  }
  return y
}

function drawRule(doc, y) {
  const { w } = pageMetrics(doc)
  doc.setDrawColor(203, 213, 225)
  doc.setLineWidth(0.2)
  doc.line(M, y, w - M, y)
  return y + 3
}

/**
 * Barres horizontales (paysage : zone libellé + barre + montant + % optionnel).
 */
function drawHorizontalBars(
  doc,
  startY,
  items,
  {
    labelKey = 'label',
    valueKey = 'value',
    pctKey = null,
    colorRgb = [220, 38, 38],
    maxBarMm = 130,
  },
) {
  const { w } = pageMetrics(doc)
  const maxV = Math.max(1, ...items.map((it) => Number(it[valueKey]) || 0))
  const barLeft = 112
  const amountRight = w - M
  let y = startY
  doc.setFontSize(6.5)
  doc.setTextColor(15, 23, 42)
  for (const it of items) {
    y = newPageIfNeeded(doc, y, 9)
    const v = Number(it[valueKey]) || 0
    const barW = (v / maxV) * maxBarMm
    const label = String(it[labelKey] || '—')
      .replace(/\s+/g, ' ')
      .trim()
    const short = label.length > 58 ? `${label.slice(0, 56)}…` : label
    doc.text(short, M, y)
    doc.setFillColor(colorRgb[0], colorRgb[1], colorRgb[2])
    doc.rect(barLeft, y - 2.5, barW, 3.4, 'F')
    doc.setTextColor(15, 23, 42)
    let right = formatEurPdf(v)
    if (pctKey && it[pctKey] != null && it[pctKey] !== '') {
      right = `${right}  (${it[pctKey]})`
    }
    doc.text(String(right), amountRight, y, { align: 'right' })
    y += 5.5
  }
  return y + 3
}

function sectionTitle(doc, y, text) {
  y = newPageIfNeeded(doc, y, 16)
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text(text, M, y)
  doc.setFont('helvetica', 'normal')
  y = drawRule(doc, y + 2.5)
  return y + 2
}

function subTitle(doc, y, text) {
  y = newPageIfNeeded(doc, y, 11)
  doc.setFontSize(9.5)
  doc.setTextColor(30, 64, 175)
  doc.setFont('helvetica', 'bold')
  doc.text(text, M, y)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(15, 23, 42)
  return y + 5
}

function tableSynth(doc, y, m) {
  const { contentW } = pageMetrics(doc)
  y = newPageIfNeeded(doc, y, 32)
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    tableWidth: contentW,
    head: [['Indicateur', 'Montant']],
    body: [
      ['CA global (produits 7x, non affectés inclus)', formatEurPdf(m.caGlobal)],
      ['Charges globales (classe 6)', formatEurPdf(m.chargesGlobales)],
      ['Résultat (CA − charges)', formatEurPdf(m.resultat)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: contentW * 0.62 },
      1: { halign: 'right', fontStyle: 'bold', cellWidth: contentW * 0.38 },
    },
    styles: { minCellHeight: 6, cellPadding: 2 },
  })
  return doc.lastAutoTable.finalY + 6
}

function buildClientsTableBody(scope) {
  const rows = scope.clientsGlobal || []
  if (!rows.length) return { head: [], body: [] }
  const totalClients = rows.reduce((s, r) => s + (Number(r.ca) || 0), 0)
  const caGlobal = Number(scope.met?.caGlobal) || 0
  const head = [
    ['Client / compte 7x (produits)', 'CA', '% / total clients 7x *', '% / CA global **'],
  ]
  const body = rows.map((r) => {
    const c = Number(r.ca) || 0
    const pClients = totalClients > 0.0001 ? ((c / totalClients) * 100).toFixed(1) : '—'
    const pGlobal = caGlobal > 0.0001 ? ((c / caGlobal) * 100).toFixed(1) : '—'
    return [
      `${r.est_groupe ? '★ ' : ''}${(r.compte_lib || '—').replace(/\s+/g, ' ').trim()}`,
      formatEurPdf(c),
      `${pClients} %`,
      `${pGlobal} %`,
    ]
  })
  return { head, body, totalClients, caGlobal }
}

function tableRecapMensuel(doc, y, scope) {
  const { contentW } = pageMetrics(doc)
  const rows = scope.recapMensuel || []
  y = newPageIfNeeded(doc, y, 22)
  if (!rows.length) {
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text('Aucun mois sur cette plage (vérifier les dates de période).', M, y)
    return y + 5
  }
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    tableWidth: contentW,
    head: [
      [
        'Mois',
        'CA global (7x)',
        'CA affecté',
        'Pr. non affectés',
        'Charges (6)',
        'Résultat',
      ],
    ],
    body: rows.map((r) => {
      const m = r.met
      return [
        r.label,
        formatEurPdf(m.caGlobal),
        formatEurPdf(m.caAffecte),
        formatEurPdf(m.produitsNonAffectes),
        formatEurPdf(m.chargesGlobales),
        formatEurPdf(m.resultat),
      ]
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 6, fontStyle: 'bold' },
    bodyStyles: { fontSize: 6.5, textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: contentW * 0.2 },
      1: { halign: 'right', cellWidth: contentW * 0.16 },
      2: { halign: 'right', cellWidth: contentW * 0.16 },
      3: { halign: 'right', cellWidth: contentW * 0.16 },
      4: { halign: 'right', cellWidth: contentW * 0.16 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: contentW * 0.16 },
    },
  })
  y = doc.lastAutoTable.finalY + 2
  doc.setFontSize(5.5)
  doc.setTextColor(100, 116, 139)
  doc.text(
    'Chaque ligne applique les mêmes règles que la synthèse, sur le mois indiqué (bornes dans l’intitulé).',
    M,
    y,
  )
  return y + 4
}

function drawDocHeader(doc, data) {
  const { w } = pageMetrics(doc)
  const gen = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  let y = M
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'normal')
  doc.text(`Généré le ${gen}`, w - M, y, { align: 'right' })
  y += 6
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text('Rapport — Analyse par métier (FEC)', M, y)
  doc.setFont('helvetica', 'normal')
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(71, 85, 105)
  doc.text(`Période (filtre) : ${data.periodeLabel || '—'}`, M, y)
  y += 4
  if (data.dateDebut && data.dateFin) {
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    doc.text(`Bornes comptables : ${data.dateDebut} → ${data.dateFin}`, M, y)
    y += 5
  } else {
    y += 2
  }
  doc.setFontSize(7.5)
  doc.setTextColor(80, 80, 80)
  const note = doc.splitTextToSize(
    'Montants en euros. Résultat = CA produits 7x (y compris non affectés) − charges 6. ' +
      'Partie I : vue consolidée toutes sociétés FEC. Partie II : même contenu, société par société.',
    w - 2 * M,
  )
  doc.text(note, M, y)
  y += note.length * 3.2 + 5
  return y
}

function renderScope(
  doc,
  scope,
  { periodeLabel, isPartie, partieIdx, startY, showPeriodeSubline = true, societes = [] },
) {
  const { contentW } = pageMetrics(doc)
  const title = isPartie ? `Partie ${partieIdx} — ${scope.label}` : `Vue — ${scope.label}`
  let y = startY != null ? sectionTitle(doc, startY, title) : sectionTitle(doc, M + 2, title)
  if (showPeriodeSubline) {
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(`Période : ${periodeLabel}`, M, y)
    y += 7
  } else {
    y += 3
  }

  y = subTitle(doc, y, '0. Récapitulatif par mois (mêmes indicateurs, sous-périodes mensuelles)')
  y = tableRecapMensuel(doc, y, scope)

  y = subTitle(doc, y, '1. Synthèse (période complète)')
  y = tableSynth(doc, y, scope.met)

  y = subTitle(doc, y, '2. CA par groupe métier (tableau + graphique)')
  y = newPageIfNeeded(doc, y, 18 + (scope.byMetier?.length || 0) * 4.5)
  if (scope.byMetier?.length) {
    const totM = scope.byMetier.reduce((s, r) => s + (Number(r.ca) || 0), 0)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      tableWidth: contentW,
      head: [['Métier', 'Code', 'CA', '% du CA par métier']],
      body: scope.byMetier.map((r) => {
        const c = Number(r.ca) || 0
        const p = totM > 0.0001 ? ((c / totM) * 100).toFixed(1) : '—'
        return [r.libelle, r.code || '—', formatEurPdf(c), `${p} %`]
      }),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: contentW * 0.42 },
        1: { cellWidth: contentW * 0.1 },
        2: { halign: 'right', cellWidth: contentW * 0.22 },
        3: { halign: 'right', cellWidth: contentW * 0.16 },
      },
    })
    y = doc.lastAutoTable.finalY + 3
  } else {
    y += 2
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text('Aucune donnée CA par métier sur ce périmètre.', M, y)
    y += 5
  }
  y = subTitle(doc, y, 'Graphique (CA par métier)')
  y = drawHorizontalBars(
    doc,
    y,
    scope.byMetier?.map((r) => {
      const c = Number(r.ca) || 0
      return { label: `${r.code} ${r.libelle}`, value: c }
    }) || [],
    { valueKey: 'value', colorRgb: [37, 99, 235] },
  )

  y = subTitle(doc, y, '3. CA par client / groupe (produits 7x FEC — tableaux + graphique)')
  const cl = buildClientsTableBody(scope)
  y = newPageIfNeeded(doc, y, 22 + (cl.body?.length || 0) * 3.2)
  if (cl.body?.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      tableWidth: contentW,
      head: cl.head,
      body: cl.body,
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 6.5 },
      bodyStyles: { fontSize: 6.5 },
      columnStyles: {
        0: { cellWidth: contentW * 0.4 },
        1: { halign: 'right', cellWidth: contentW * 0.2 },
        2: { halign: 'right', cellWidth: contentW * 0.2 },
        3: { halign: 'right', cellWidth: contentW * 0.2 },
      },
    })
    y = doc.lastAutoTable.finalY + 2
    doc.setFontSize(5.5)
    doc.setTextColor(100, 116, 139)
    doc.text(
      "* Part du client dans le total des lignes 'clients 7x' (somme = CA affecté par la ventilation client).",
      M,
      y,
    )
    y += 3
    doc.text(
      '** Part du client dans le CA global produits (7x) du périmètre (ligne « CA global » en § 1).',
      M,
      y,
    )
    y += 5
  } else {
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text('Aucun client / groupe (7x) sur ce périmètre.', M, y)
    y += 5
  }
  y = subTitle(doc, y, 'Graphique (principaux clients — CA et % / CA global)')
  const topCli = (scope.clientsGlobal || []).slice(0, 20)
  const caG = Number(scope.met?.caGlobal) || 0
  y = drawHorizontalBars(
    doc,
    y,
    topCli.map((r) => {
      const c = Number(r.ca) || 0
      const pG = caG > 0.0001 ? ((c / caG) * 100).toFixed(1) : '—'
      return {
        label: `${r.est_groupe ? '★ ' : ''}${(r.compte_lib || '—').slice(0, 48)}`,
        value: c,
        pct: `${pG} % / CA gl.`,
      }
    }),
    { valueKey: 'value', pctKey: 'pct', colorRgb: [5, 150, 105] },
  )

  y = subTitle(doc, y, '4. Charges par famille (classe 6)')
  y = newPageIfNeeded(doc, y, 22)
  if ((scope.familles || []).length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      tableWidth: contentW,
      head: [['Famille', 'Montant', '% des charges (familles)']],
      body: [
        ...(scope.familles || []).map((f) => [f.label, formatEurPdf(f.charge), f.pct != null ? `${f.pct} %` : '—']),
        ...(Number(scope.horsFamilles) > 0.01
          ? [['Hors regroupement (6x non rattachés)', formatEurPdf(scope.horsFamilles), '—']]
          : []),
      ],
      theme: 'grid',
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      columnStyles: {
        0: { cellWidth: contentW * 0.5 },
        1: { halign: 'right', cellWidth: contentW * 0.25 },
        2: { halign: 'right', cellWidth: contentW * 0.25 },
      },
    })
    y = doc.lastAutoTable.finalY + 3
  } else {
    doc.setFontSize(7)
    doc.text('Aucune famille de charges (ou écriture nulle).', M, y)
    y += 5
  }
  y = subTitle(doc, y, 'Graphique (charges par famille)')
  const famG = [
    ...(scope.familles || []).map((f) => ({ label: f.label, value: f.charge })),
    ...(Number(scope.horsFamilles) > 0.01
      ? [{ label: 'Hors familles', value: scope.horsFamilles }]
      : []),
  ]
  y = drawHorizontalBars(doc, y, famG, { valueKey: 'value', colorRgb: [220, 38, 38] })

  y = subTitle(
    doc,
    y,
    "5. Détail compte de résultat — Produits 7x par métier (crédit − débit × part d'affectation)",
  )
  y = newPageIfNeeded(doc, y, 10)
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  doc.text('Ventilation des comptes de produit par affectation métier, pour chaque activité affichée ci-dessus.', M, y)
  y += 4

  for (const block of scope.produitsByMetier || []) {
    y = newPageIfNeeded(doc, y, 18 + (block.comptes?.length || 0) * 2.8)
    y = subTitle(doc, y, `Métier : ${block.metier?.libelle || '—'} (${block.metier?.code || '—'})`)
    if (block.comptes?.length) {
      const totB = block.comptes.reduce((s, c) => s + (Number(c.ca) || 0), 0)
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        tableWidth: contentW,
        head: [['Compte', 'Libellé', 'CA (part affectée)', '% du poste métier']],
        body: block.comptes.map((c) => {
          const v = Number(c.ca) || 0
          const p = totB > 0.0001 ? ((v / totB) * 100).toFixed(1) : '—'
          return [c.compte_num, (c.compte_lib || '—').slice(0, 75), formatEurPdf(c.ca), `${p} %`]
        }),
        theme: 'grid',
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 6.5 },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: contentW * 0.52 },
          2: { halign: 'right', cellWidth: contentW * 0.14 },
          3: { halign: 'right', cellWidth: contentW * 0.12 },
        },
      })
      y = doc.lastAutoTable.finalY + 5
    } else {
      doc.setFontSize(7)
      doc.setTextColor(120, 120, 120)
      doc.text('Aucun compte pour ce métier sur la période.', M + 3, y)
      y += 4
    }
  }

  y = subTitle(doc, y, '6. Détail des charges par famille (comptes 6 regroupés)')
  doc.setFontSize(6.5)
  doc.setTextColor(100, 116, 139)
  y = newPageIfNeeded(doc, y, 8)
  doc.text('Ventilation par compte (débit − crédit) pour chaque regroupement de la section 4.', M, y)
  y += 4

  for (const f of scope.chargesByFamilleDetail || []) {
    y = newPageIfNeeded(doc, y, 16 + (f.comptes?.length || 0) * 2.6)
    y = subTitle(doc, y, `Famille : ${f.famille} — total ${formatEurPdf(f.total)}`)
    if (f.comptes?.length) {
      const totF = f.comptes.reduce((s, c) => s + (Number(c.charge) || 0), 0)
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        tableWidth: contentW,
        head: [['Compte', 'Libellé', 'Société', 'Charge', '% de la famille']],
        body: f.comptes.map((c) => {
          const v = Number(c.charge) || 0
          const p = totF > 0.0001 ? ((v / totF) * 100).toFixed(1) : '—'
          return [
            c.compte_num,
            (c.compte_lib || '—').slice(0, 60),
            societeLibelle(societes, c.societe_id),
            formatEurPdf(c.charge),
            `${p} %`,
          ]
        }),
        theme: 'grid',
        headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 6.5 },
        bodyStyles: { fontSize: 6.5 },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: contentW * 0.4 },
          2: { cellWidth: contentW * 0.2 },
          3: { halign: 'right', cellWidth: 38 },
          4: { halign: 'right', cellWidth: 36 },
        },
      })
      y = doc.lastAutoTable.finalY + 4
    } else {
      doc.setFontSize(7)
      doc.text('Aucun détail compte pour cette famille.', M, y)
      y += 4
    }
  }

  return y
}

/**
 * Génère le PDF à partir du résultat de `collectAnalytiqueRapportData` (même période / même FEC).
 * Tout le document en **paysage** A4.
 * @param {{ periodeLabel?: string, dateDebut?: string, dateFin?: string, societes?: Array<{id:number,nom?:string}>, consolidated: object, parSociete?: object[] }} data
 */
export function exportAnalytiqueMetierRapportPdfFromPayload(data) {
  if (!data?.consolidated) return
  const doc = new jsPDF('landscape', 'mm', PAGE)
  const societes = data.societes || []
  let y = drawDocHeader(doc, data)
  y += 2
  renderScope(doc, data.consolidated, {
    periodeLabel: data.periodeLabel,
    isPartie: true,
    partieIdx: 'I',
    startY: y,
    showPeriodeSubline: false,
    societes,
  })

  for (let i = 0; i < (data.parSociete || []).length; i++) {
    const sc = data.parSociete[i]
    doc.addPage(PAGE, LAND)
    renderScope(doc, sc, {
      periodeLabel: data.periodeLabel,
      isPartie: true,
      partieIdx: `II.${i + 1} (${i + 1} / ${data.parSociete.length})`,
      startY: M + 2,
      showPeriodeSubline: true,
      societes,
    })
  }

  const fn = `Analyse_metier_Rapport_${slug(data.periodeLabel)}.pdf`
  doc.save(fn)
}

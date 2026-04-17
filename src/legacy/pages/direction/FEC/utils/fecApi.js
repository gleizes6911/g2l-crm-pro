import API_BASE from '../../../../config/api';

async function parseJson(res) {
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: text || 'Réponse invalide' }
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`)
    err.status = res.status
    err.body = data
    throw err
  }
  return data
}

function toIsoDateFromFec8(s) {
  const x = String(s || '').replace(/\D/g, '').slice(0, 8)
  if (x.length !== 8) return null
  return `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`
}

export const fecApi = {
  baseUrl: API_BASE,

  async getSocietes() {
    const res = await fetch(`${API_BASE}/api/fec/societes`)
    return parseJson(res)
  },

  async getEcritures(societeId, { annee, dateDebut, dateFin } = {}) {
    const params = new URLSearchParams()
    if (annee != null && annee !== '') params.set('annee', String(annee))
    if (dateDebut) params.set('dateDebut', dateDebut)
    if (dateFin) params.set('dateFin', dateFin)
    const q = params.toString()
    const res = await fetch(`${API_BASE}/api/fec/societes/${societeId}/ecritures${q ? `?${q}` : ''}`)
    return parseJson(res)
  },

  async importFEC({ siren, nom, couleur, annee, dateDebut, dateFin, nomFichier, ecritures }) {
    const res = await fetch(`${API_BASE}/api/fec/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siren,
        nom,
        couleur,
        annee,
        dateDebut,
        dateFin,
        nomFichier,
        ecritures,
      }),
    })
    return parseJson(res)
  },

  async deleteSociete(societeId) {
    const res = await fetch(`${API_BASE}/api/fec/societes/${societeId}`, { method: 'DELETE' })
    return parseJson(res)
  },

  async deleteExercice(exerciceId) {
    const res = await fetch(`${API_BASE}/api/fec/exercices/${exerciceId}`, { method: 'DELETE' })
    return parseJson(res)
  },

  toIsoDateFromFec8,
}

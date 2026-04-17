const express = require('express')
const router = express.Router()
const { pool } = require('../services/database')

function requireDb(res) {
  if (!pool) {
    res.status(503).json({ error: 'Base de données non configurée' })
    return false
  }
  return true
}

// ── SOCIÉTÉS ────────────────────────────────────────────────

router.get('/referentiel/societes', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { type, actif = 'true' } = req.query
    let query = `
      SELECT s.*,
        (SELECT COUNT(*) FROM g2l_contrats_emploi ce
         WHERE ce.societe_id = s.id AND ce.actif = true)
        as nb_employes_actifs,
        (SELECT COUNT(*) FROM g2l_affectations_vehicules av
         WHERE av.societe_id = s.id AND av.actif = true)
        as nb_vehicules_actifs
      FROM g2l_societes s
      WHERE 1=1
    `
    const params = []
    if (type) {
      params.push(type)
      query += ` AND s.type = $${params.length}`
    }
    if (actif !== 'all') {
      params.push(actif === 'true')
      query += ` AND s.actif = $${params.length}`
    }
    query += ` ORDER BY s.type, s.nom`
    const result = await pool.query(query, params)
    res.json({ societes: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/referentiel/societes', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const {
      code, nom, nom_court, siren, type,
      patterns_sf, compte_fec_achat,
      contact_nom, contact_email, contact_tel,
      date_debut, date_fin, notes,
    } = req.body
    if (!code || !nom || !type) {
      return res.status(400).json({
        error: 'code, nom et type sont requis',
      })
    }
    const result = await pool.query(
      `
      INSERT INTO g2l_societes (
        code, nom, nom_court, siren, type,
        patterns_sf, compte_fec_achat,
        contact_nom, contact_email, contact_tel,
        date_debut, date_fin, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `,
      [
        code,
        nom,
        nom_court,
        siren,
        type,
        JSON.stringify(patterns_sf || []),
        compte_fec_achat,
        contact_nom,
        contact_email,
        contact_tel,
        date_debut,
        date_fin,
        notes,
      ],
    )
    res.status(201).json({ societe: result.rows[0] })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Code société déjà existant' })
    }
    res.status(500).json({ error: err.message })
  }
})

router.put('/referentiel/societes/:id', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { id } = req.params
    const fields = [
      'nom', 'nom_court', 'siren', 'type',
      'patterns_sf', 'compte_fec_achat',
      'contact_nom', 'contact_email', 'contact_tel',
      'date_debut', 'date_fin', 'actif', 'notes',
    ]
    const updates = []
    const values = []
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(f === 'patterns_sf' ? JSON.stringify(req.body[f]) : req.body[f])
        updates.push(`${f} = $${values.length}`)
      }
    })
    if (!updates.length) {
      return res.status(400).json({ error: 'Aucun champ à modifier' })
    }
    updates.push('updated_at = NOW()')
    values.push(id)
    const result = await pool.query(
      `
      UPDATE g2l_societes
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `,
      values,
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Société non trouvée' })
    }
    res.json({ societe: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── PERSONNES ───────────────────────────────────────────────

router.get('/referentiel/personnes', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { type_personne, societe_id, actif = 'true' } = req.query
    let query = `
      SELECT p.*,
        s.nom as societe_actuelle,
        s.nom_court as societe_actuelle_court,
        ce.type_contrat,
        ce.poste,
        ce.salaire_brut_mensuel,
        ce.date_debut as date_debut_contrat
      FROM g2l_personnes p
      LEFT JOIN g2l_contrats_emploi ce
        ON ce.personne_id = p.id AND ce.actif = true
      LEFT JOIN g2l_societes s
        ON s.id = ce.societe_id
      WHERE 1=1
    `
    const params = []
    if (type_personne) {
      params.push(type_personne)
      query += ` AND p.type_personne = $${params.length}`
    }
    if (societe_id) {
      params.push(societe_id)
      query += ` AND ce.societe_id = $${params.length}`
    }
    if (actif !== 'all') {
      params.push(actif === 'true')
      query += ` AND p.actif = $${params.length}`
    }
    query += ` ORDER BY p.nom, p.prenom`
    const result = await pool.query(query, params)
    res.json({ personnes: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/referentiel/personnes', async (req, res) => {
  if (!requireDb(res)) return
  const {
    nom, prenom, date_naissance,
    email, telephone, mobile,
    adresse_rue, adresse_cp, adresse_ville,
    type_personne, id_salesforce,
    notes,
    contrat,
  } = req.body
  if (!nom || !prenom || !type_personne) {
    return res.status(400).json({
      error: 'nom, prenom et type_personne sont requis',
    })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const personneResult = await client.query(
      `
      INSERT INTO g2l_personnes (
        nom, prenom, date_naissance,
        email, telephone, mobile,
        adresse_rue, adresse_cp, adresse_ville,
        type_personne, id_salesforce, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `,
      [
        nom.toUpperCase(),
        prenom,
        date_naissance,
        email,
        telephone,
        mobile,
        adresse_rue,
        adresse_cp,
        adresse_ville,
        type_personne,
        id_salesforce,
        notes,
      ],
    )
    const personne = personneResult.rows[0]
    if (contrat?.societe_id && contrat?.type_contrat) {
      await client.query(
        `
        INSERT INTO g2l_contrats_emploi (
          personne_id, societe_id, type_contrat,
          poste, service, salaire_brut_mensuel, date_debut
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
        [
          personne.id,
          contrat.societe_id,
          contrat.type_contrat,
          contrat.poste,
          contrat.service,
          contrat.salaire_brut_mensuel,
          contrat.date_debut || new Date().toISOString().split('T')[0],
        ],
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ personne })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

router.put('/referentiel/personnes/:id', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { id } = req.params
    const fields = [
      'nom', 'prenom', 'date_naissance',
      'email', 'telephone', 'mobile',
      'adresse_rue', 'adresse_cp', 'adresse_ville',
      'type_personne', 'id_salesforce', 'actif', 'notes',
    ]
    const updates = []
    const values = []
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        values.push(f === 'nom' ? req.body[f].toUpperCase() : req.body[f])
        updates.push(`${f} = $${values.length}`)
      }
    })
    if (!updates.length) {
      return res.status(400).json({ error: 'Aucun champ à modifier' })
    }
    updates.push('updated_at = NOW()')
    values.push(id)
    const result = await pool.query(
      `
      UPDATE g2l_personnes
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `,
      values,
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Personne non trouvée' })
    }
    res.json({ personne: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/referentiel/personnes/:id/contrats', async (req, res) => {
  if (!requireDb(res)) return
  const {
    societe_id, type_contrat, poste, service,
    salaire_brut_mensuel, date_debut, notes,
  } = req.body
  if (!societe_id || !type_contrat || !date_debut) {
    return res.status(400).json({
      error: 'societe_id, type_contrat et date_debut requis',
    })
  }
  const { id } = req.params
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      UPDATE g2l_contrats_emploi
      SET actif = false,
          date_fin = $1::date - interval '1 day'
      WHERE personne_id = $2 AND actif = true
    `,
      [date_debut, id],
    )
    const result = await client.query(
      `
      INSERT INTO g2l_contrats_emploi (
        personne_id, societe_id, type_contrat,
        poste, service, salaire_brut_mensuel,
        date_debut, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `,
      [
        id,
        societe_id,
        type_contrat,
        poste,
        service,
        salaire_brut_mensuel,
        date_debut,
        notes,
      ],
    )
    await client.query('COMMIT')
    res.status(201).json({ contrat: result.rows[0] })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ── VÉHICULES ───────────────────────────────────────────────

router.get('/referentiel/vehicules', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { societe_id, actif = 'true' } = req.query
    let query = `
      SELECT v.*,
        s.nom as societe_actuelle,
        s.nom_court as societe_actuelle_court,
        cv.type_contrat, cv.loyer_mensuel_ht,
        cv.fournisseur, cv.date_fin as fin_contrat,
        av2.prime_mensuelle_ttc as assurance_mensuelle,
        av2.assureur
      FROM g2l_vehicules v
      LEFT JOIN g2l_affectations_vehicules av
        ON av.vehicule_id = v.id AND av.actif = true
      LEFT JOIN g2l_societes s ON s.id = av.societe_id
      LEFT JOIN g2l_contrats_vehicules cv
        ON cv.vehicule_id = v.id AND cv.actif = true
      LEFT JOIN g2l_assurances_vehicules av2
        ON av2.vehicule_id = v.id AND av2.actif = true
      WHERE 1=1
    `
    const params = []
    if (societe_id) {
      params.push(societe_id)
      query += ` AND av.societe_id = $${params.length}`
    }
    if (actif !== 'all') {
      params.push(actif === 'true')
      query += ` AND v.actif = $${params.length}`
    }
    query += ` ORDER BY v.immatriculation`
    const result = await pool.query(query, params)
    res.json({ vehicules: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/referentiel/vehicules', async (req, res) => {
  if (!requireDb(res)) return
  const {
    immatriculation, marque, modele,
    type_vehicule, energie,
    date_mise_en_service, date_premiere_immat,
    id_salesforce, id_webfleet, notes,
    societe_id, date_debut_affectation,
    contrat,
  } = req.body
  if (!immatriculation) {
    return res.status(400).json({
      error: 'immatriculation requise',
    })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const vehResult = await client.query(
      `
      INSERT INTO g2l_vehicules (
        immatriculation, marque, modele,
        type_vehicule, energie,
        date_mise_en_service, date_premiere_immat,
        id_salesforce, id_webfleet, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
      [
        immatriculation.toUpperCase(),
        marque,
        modele,
        type_vehicule,
        energie,
        date_mise_en_service,
        date_premiere_immat,
        id_salesforce,
        id_webfleet,
        notes,
      ],
    )
    const vehicule = vehResult.rows[0]
    if (societe_id) {
      await client.query(
        `
        INSERT INTO g2l_affectations_vehicules
          (vehicule_id, societe_id, date_debut)
        VALUES ($1, $2, $3)
      `,
        [
          vehicule.id,
          societe_id,
          date_debut_affectation || new Date().toISOString().split('T')[0],
        ],
      )
    }
    if (contrat?.type_contrat && societe_id) {
      await client.query(
        `
        INSERT INTO g2l_contrats_vehicules (
          vehicule_id, societe_id, type_contrat,
          fournisseur, loyer_mensuel_ht, loyer_mensuel_ttc,
          km_contractuel_mois, date_debut, date_fin
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
        [
          vehicule.id,
          societe_id,
          contrat.type_contrat,
          contrat.fournisseur,
          contrat.loyer_mensuel_ht,
          contrat.loyer_mensuel_ttc,
          contrat.km_contractuel_mois,
          contrat.date_debut,
          contrat.date_fin,
        ],
      )
    }
    await client.query('COMMIT')
    res.status(201).json({ vehicule })
  } catch (err) {
    await client.query('ROLLBACK')
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Immatriculation déjà existante',
      })
    }
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ── PARAMÈTRES COMPTABLES ───────────────────────────────────

router.get('/referentiel/parametres-comptables', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const result = await pool.query(`
      SELECT * FROM g2l_parametres_comptables
      WHERE actif = true
      ORDER BY categorie
    `)
    res.json({ parametres: result.rows })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/referentiel/parametres-comptables/:id', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const { id } = req.params
    const { comptes_fec, description, inclus_consolid } = req.body
    const result = await pool.query(
      `
      UPDATE g2l_parametres_comptables
      SET comptes_fec = $1::jsonb,
          description = $2,
          inclus_consolid = $3,
          updated_at = NOW()
      WHERE id = $4::uuid
      RETURNING *
    `,
      [JSON.stringify(comptes_fec || []), description, inclus_consolid ?? true, id],
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Paramètre non trouvé' })
    }
    res.json({ parametre: result.rows[0] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/referentiel/prestataires/patterns', async (req, res) => {
  if (!requireDb(res)) return
  try {
    const result = await pool.query(`
      SELECT id, code, nom, nom_court,
             patterns_sf, compte_fec_achat
      FROM g2l_societes
      WHERE type IN (
        'PRESTATAIRE_LIVRAISON', 'SOUS_TRAITANT'
      )
      AND actif = true
    `)
    const patterns = []
    result.rows.forEach((s) => {
      const pats = Array.isArray(s.patterns_sf) ? s.patterns_sf : []
      pats.forEach((p) => {
        patterns.push({
          pattern: String(p).toUpperCase(),
          societe_id: s.id,
          societe_code: s.code,
          societe_nom: s.nom,
          compte_fec: s.compte_fec_achat,
        })
      })
    })
    res.json({ prestataires: result.rows, patterns })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router

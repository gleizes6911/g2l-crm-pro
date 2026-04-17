const fs = require('fs');
const path = require('path');
const { pool } = require('./database');

// Catégories de documents AMÉLIORÉES
const CATEGORIES = {
  CNI: {
    id: 'CNI',
    label: "Carte Nationale d'Identité",
    couleur: 'blue',
    obligatoire: true,
    expirable: true,
    dureeValidite: 15,
    versions: ['recto', 'verso'],
    validation: 'RH',
    alerteDays: [90, 30, 15, 7],
  },
  PERMIS: {
    id: 'PERMIS',
    label: 'Permis de Conduire',
    couleur: 'green',
    obligatoire: true,
    expirable: true,
    dureeValidite: 15,
    versions: ['recto', 'verso'],
    validation: 'RH',
    alerteDays: [90, 30, 15, 7],
  },
  CONTRAT: {
    id: 'CONTRAT',
    label: 'Contrat de Travail',
    couleur: 'purple',
    obligatoire: true,
    expirable: false,
    versions: ['initial'],
    validation: 'RH',
  },
  AVENANT: {
    id: 'AVENANT',
    label: 'Avenant Contrat',
    couleur: 'indigo',
    obligatoire: false,
    expirable: false,
    versions: ['unique'],
    validation: 'RH',
    liéA: 'CONTRAT',
  },
  FICHE_PAIE: {
    id: 'FICHE_PAIE',
    label: 'Fiche de Paie',
    couleur: 'yellow',
    obligatoire: false,
    expirable: false,
    versions: ['mensuel'],
    validation: 'AUTO',
  },
  DIPLOME: {
    id: 'DIPLOME',
    label: 'Diplôme / Certification',
    couleur: 'pink',
    obligatoire: false,
    expirable: false,
    versions: ['unique'],
    validation: 'RH',
  },
  FORMATION: {
    id: 'FORMATION',
    label: 'Attestation Formation',
    couleur: 'orange',
    obligatoire: false,
    expirable: true,
    dureeValidite: 5,
    versions: ['unique'],
    validation: 'RH',
    alerteDays: [60, 30, 15],
  },
  VISITE_MEDICALE: {
    id: 'VISITE_MEDICALE',
    label: 'Visite Médicale',
    couleur: 'red',
    obligatoire: true,
    expirable: true,
    dureeValidite: 2,
    versions: ['unique'],
    validation: 'RH',
    alerteDays: [60, 30, 15, 7, 0],
    afficherPlanning: true,
  },
  RIB: {
    id: 'RIB',
    label: 'RIB',
    couleur: 'teal',
    obligatoire: true,
    expirable: false,
    versions: ['unique'],
    validation: 'RH',
  },
  AUTRE: {
    id: 'AUTRE',
    label: 'Autre Document',
    couleur: 'gray',
    obligatoire: false,
    expirable: false,
    versions: ['unique'],
    validation: 'AUCUNE',
  },
};

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function requirePool() {
  if (!pool) {
    throw new Error('[documents] Pool PostgreSQL indisponible — définir DATABASE_URL');
  }
}

function toDateOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().split('T')[0];
  return String(value).split('T')[0];
}

function extractScalars(doc) {
  return {
    employe_id: doc.employeId != null ? String(doc.employeId) : '',
    categorie: doc.categorie ?? null,
    statut: doc.statut ?? null,
    original_name: doc.originalName ?? null,
    filename: doc.filename ?? null,
    mime_type: doc.mimeType ?? null,
    date_expiration: toDateOrNull(doc.dateExpiration),
  };
}

function coerceDateField(v) {
  if (v == null || v === '') return v;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0];
}

function rowToDocument(row) {
  if (!row) return null;
  let base = {};
  if (row.data != null) {
    base = typeof row.data === 'string' ? JSON.parse(row.data) : { ...row.data };
  }
  if (!row.data || Object.keys(base).length === 0) {
    base = {
      id: row.id,
      employeId: row.employe_id,
      categorie: row.categorie,
      statut: row.statut,
      originalName: row.original_name,
      filename: row.filename,
      mimeType: row.mime_type,
      dateExpiration: row.date_expiration,
    };
  }
  base.id = row.id;
  if (base.employeId == null && row.employe_id != null) base.employeId = row.employe_id;
  if (base.dateExpiration != null) base.dateExpiration = coerceDateField(base.dateExpiration);
  else if (row.date_expiration != null) base.dateExpiration = coerceDateField(row.date_expiration);
  const ca = row.created_at;
  if (ca && !base.createdAt) base.createdAt = ca instanceof Date ? ca.toISOString() : ca;
  const ua = row.updated_at;
  if (ua && !base.updatedAt) base.updatedAt = ua instanceof Date ? ua.toISOString() : ua;
  return base;
}

async function persistDocument(doc) {
  requirePool();
  doc.updatedAt = new Date().toISOString();
  const s = extractScalars(doc);
  await pool.query(
    `UPDATE documents SET
      employe_id = $2,
      categorie = $3,
      statut = $4,
      original_name = $5,
      filename = $6,
      mime_type = $7,
      date_expiration = $8::date,
      updated_at = NOW(),
      data = $9::jsonb
    WHERE id = $1`,
    [doc.id, s.employe_id, s.categorie, s.statut, s.original_name, s.filename, s.mime_type, s.date_expiration, doc]
  );
}

async function loadDocumentRow(id) {
  requirePool();
  const { rows } = await pool.query(
    `SELECT id, employe_id, categorie, statut, original_name, filename, mime_type, date_expiration,
            created_at, updated_at, data
     FROM documents WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function fetchAllDocuments() {
  requirePool();
  const { rows } = await pool.query(
    `SELECT id, employe_id, categorie, statut, original_name, filename, mime_type, date_expiration,
            created_at, updated_at, data
     FROM documents ORDER BY created_at ASC`
  );
  return rows.map(rowToDocument);
}

async function getDocuments() {
  return fetchAllDocuments();
}

async function getDocumentsByEmploye(employeId) {
  const all = await fetchAllDocuments();
  return all.filter(d => String(d.employeId) === String(employeId));
}

async function getDocumentById(id) {
  const row = await loadDocumentRow(id);
  return row ? rowToDocument(row) : null;
}

async function ajouterDocument(docData) {
  requirePool();
  const categorie = CATEGORIES[docData.categorie] || CATEGORIES.AUTRE;

  const document = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    ...docData,
    statut: categorie.validation === 'AUTO' ? 'Validé' : 'En attente validation',
    valideParId: null,
    valideParNom: null,
    valideAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const s = extractScalars(document);
  await pool.query(
    `INSERT INTO documents (
      id, employe_id, categorie, statut, original_name, filename, mime_type, date_expiration, data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::jsonb)`,
    [document.id, s.employe_id, s.categorie, s.statut, s.original_name, s.filename, s.mime_type, s.date_expiration, document]
  );

  console.log('[DOCUMENTS] Document ajouté:', document.id);
  return document;
}

async function validerDocument(docId, validateurId, validateurNom) {
  const row = await loadDocumentRow(docId);
  if (!row) return null;

  const doc = rowToDocument(row);
  doc.statut = 'Validé';
  doc.valideParId = validateurId;
  doc.valideParNom = validateurNom;
  doc.valideAt = new Date().toISOString();
  doc.updatedAt = new Date().toISOString();

  await persistDocument(doc);
  console.log('[DOCUMENTS] Document validé:', doc.id);
  return doc;
}

async function refuserDocument(docId, validateurId, validateurNom, motifRefus) {
  const row = await loadDocumentRow(docId);
  if (!row) return null;

  const doc = rowToDocument(row);
  doc.statut = 'Refusé';
  doc.valideParId = validateurId;
  doc.valideParNom = validateurNom;
  doc.motifRefus = motifRefus;
  doc.valideAt = new Date().toISOString();
  doc.updatedAt = new Date().toISOString();

  await persistDocument(doc);
  console.log('[DOCUMENTS] Document refusé:', doc.id);
  return doc;
}

async function modifierDocument(id, nouvellesDonnees) {
  const row = await loadDocumentRow(id);
  if (!row) return null;

  const doc = rowToDocument(row);
  if (nouvellesDonnees.dateExpiration !== undefined) {
    doc.dateExpiration = nouvellesDonnees.dateExpiration;
  }
  if (nouvellesDonnees.description !== undefined) {
    doc.description = nouvellesDonnees.description;
  }
  if (nouvellesDonnees.heureVisite !== undefined) {
    doc.heureVisite = nouvellesDonnees.heureVisite;
  }
  doc.updatedAt = new Date().toISOString();

  await persistDocument(doc);
  console.log('[DOCUMENTS] Document modifié:', id);
  return doc;
}

async function supprimerDocument(id) {
  const row = await loadDocumentRow(id);
  if (!row) return false;

  const doc = rowToDocument(row);

  if (doc.filename) {
    const filepath = path.join(uploadsDir, doc.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  requirePool();
  await pool.query('DELETE FROM documents WHERE id = $1', [id]);
  console.log('[DOCUMENTS] Document supprimé:', id);
  return true;
}

async function calculerAlertesExpiration(employeId) {
  const docsEmploye = await getDocumentsByEmploye(employeId);
  const alertes = [];
  const aujourdhui = new Date();

  docsEmploye.forEach(doc => {
    const categorie = CATEGORIES[doc.categorie];

    if (categorie && categorie.expirable && doc.dateExpiration && doc.statut === 'Validé') {
      const dateExp = new Date(doc.dateExpiration);
      const joursRestants = Math.ceil((dateExp - aujourdhui) / (1000 * 60 * 60 * 24));

      if (joursRestants < 0) {
        alertes.push({
          docId: doc.id,
          employeId: doc.employeId,
          categorie: doc.categorie,
          categorieLabel: categorie.label,
          type: 'EXPIRE',
          message: `${categorie.label} expiré depuis ${Math.abs(joursRestants)} jours`,
          urgence: 'CRITIQUE',
          joursRestants,
          dateExpiration: doc.dateExpiration,
          couleur: 'red',
        });
      } else if (joursRestants === 0) {
        alertes.push({
          docId: doc.id,
          employeId: doc.employeId,
          categorie: doc.categorie,
          categorieLabel: categorie.label,
          type: 'EXPIRE_AUJOURDHUI',
          message: `${categorie.label} expire AUJOURD'HUI`,
          urgence: 'CRITIQUE',
          joursRestants,
          dateExpiration: doc.dateExpiration,
          couleur: 'red',
        });
      } else if (joursRestants <= 7) {
        alertes.push({
          docId: doc.id,
          employeId: doc.employeId,
          categorie: doc.categorie,
          categorieLabel: categorie.label,
          type: 'EXPIRE_SEMAINE',
          message: `${categorie.label} expire dans ${joursRestants} jours`,
          urgence: 'CRITIQUE',
          joursRestants,
          dateExpiration: doc.dateExpiration,
          couleur: 'red',
        });
      } else if (joursRestants <= 30) {
        alertes.push({
          docId: doc.id,
          employeId: doc.employeId,
          categorie: doc.categorie,
          categorieLabel: categorie.label,
          type: 'EXPIRE_MOIS',
          message: `${categorie.label} expire dans ${joursRestants} jours`,
          urgence: 'HAUTE',
          joursRestants,
          dateExpiration: doc.dateExpiration,
          couleur: 'orange',
        });
      } else if (joursRestants <= 90) {
        alertes.push({
          docId: doc.id,
          employeId: doc.employeId,
          categorie: doc.categorie,
          categorieLabel: categorie.label,
          type: 'EXPIRE_TRIMESTRE',
          message: `${categorie.label} expire dans ${joursRestants} jours`,
          urgence: 'MOYENNE',
          joursRestants,
          dateExpiration: doc.dateExpiration,
          couleur: 'yellow',
        });
      }
    }
  });

  return alertes;
}

async function verifierDocumentsManquants(employeId) {
  const docsEmploye = await getDocumentsByEmploye(employeId);
  const manquants = [];

  Object.values(CATEGORIES).forEach(categorie => {
    if (categorie.obligatoire) {
      const docExiste = docsEmploye.some(d => d.categorie === categorie.id && d.statut === 'Validé');

      if (!docExiste) {
        manquants.push({
          categorie: categorie.id,
          label: categorie.label,
          urgence: 'HAUTE',
          couleur: categorie.couleur,
        });
      }
    }
  });

  return manquants;
}

async function getVisitesMedicalesPourPlanning(mois, annee) {
  const documentsList = await fetchAllDocuments();
  const visites = documentsList.filter(
    d => d.categorie === 'VISITE_MEDICALE' && d.statut === 'Validé' && d.dateExpiration
  );

  return visites
    .map(v => {
      const dateExp = new Date(v.dateExpiration);
      const dateExpMois = dateExp.getMonth() + 1;
      const dateExpAnnee = dateExp.getFullYear();

      if (mois && dateExpMois !== mois) return null;
      if (annee && dateExpAnnee !== annee) return null;

      return {
        id: v.id,
        employeId: v.employeId,
        dateVisite: v.dateExpiration,
        heureVisite: v.heureVisite || '09:00',
        type: 'VISITE_MEDICALE',
        description: v.description || 'Visite médicale périodique',
      };
    })
    .filter(v => v !== null);
}

module.exports = {
  getDocuments,
  getDocumentsByEmploye,
  getDocumentById,
  ajouterDocument,
  validerDocument,
  refuserDocument,
  modifierDocument,
  supprimerDocument,
  calculerAlertesExpiration,
  verifierDocumentsManquants,
  getVisitesMedicalesPourPlanning,
  CATEGORIES,
  UPLOAD_DIR: uploadsDir,
};

const bcrypt = require('bcrypt');
const {
  pool,
  getUtilisateurByEmailDB,
  getUtilisateurByIdDB,
  getUtilisateursDB,
  createUtilisateurDB,
  updateUtilisateurDB,
  deleteUtilisateurDB,
  toggleActifDB,
  getPermissionsDB,
  setPermissionDB,
  countUtilisateursDB,
} = require('./database');

const sessions = {};

const utilisateurs = [];

async function login(email, password) {
  if (!pool) {
    return { success: false, error: 'Base de données indisponible' };
  }
  if (!email || !password) {
    return { success: false, error: 'Email ou mot de passe incorrect' };
  }

  const user = await getUtilisateurByEmailDB(email);
  if (!user || !user.password_hash) {
    return { success: false, error: 'Email ou mot de passe incorrect' };
  }

  if (user.actif === false) {
    return { success: false, error: 'Compte désactivé' };
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return { success: false, error: 'Email ou mot de passe incorrect' };
  }

  const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  const sessionData = {
    userId: user.id,
    email: user.email,
    nom: user.nom,
    role: user.role,
    salesforceId: user.salesforceId,
    societe: user.societe,
    managerId: user.managerId,
    loginAt: new Date().toISOString(),
  };

  sessions[sessionId] = sessionData;
  console.log('[AUTH] Connexion réussie:', sessionData);

  return {
    success: true,
    sessionId,
    user: sessionData,
  };
}

function logout(sessionId) {
  if (sessions[sessionId]) {
    delete sessions[sessionId];
    return { success: true };
  }
  return { success: false, error: 'Session introuvable' };
}

function verifierSession(sessionId) {
  const session = sessions[sessionId];
  if (session) {
    return { success: true, user: session };
  }
  return { success: false, error: 'Session invalide' };
}

async function getUserById(userId) {
  return getUtilisateurByIdDB(userId);
}

async function getManagerOfEmploye(employeId) {
  const employe = await getUtilisateurByIdDB(employeId);
  if (employe && employe.managerId) {
    return getUtilisateurByIdDB(employe.managerId);
  }
  return null;
}

async function peutValiderAbsence(userId, absenceEmployeId) {
  const user = await getUserById(userId);
  if (!user) return false;
  if (user.role === 'MANAGER') {
    return true;
  }
  return false;
}

async function ajouterUtilisateur(userData) {
  return createUtilisateur(userData);
}

async function getUtilisateurs() {
  return getAllUtilisateurs();
}

async function getAllUtilisateurs() {
  return getUtilisateursDB();
}

async function getUtilisateurById(id) {
  return getUtilisateurByIdDB(id);
}

async function createUtilisateur(userData) {
  if (!userData.password || String(userData.password).length === 0) {
    throw new Error('Mot de passe requis');
  }
  const dup = await getUtilisateurByEmailDB(userData.email);
  if (dup) {
    throw new Error('Cet email est déjà utilisé');
  }

  const password_hash = await bcrypt.hash(userData.password, 10);
  const newRow = await createUtilisateurDB({
    email: userData.email,
    password_hash,
    nom: userData.nom,
    prenom: userData.prenom || '',
    role: userData.role || 'EMPLOYE',
    salesforce_id: userData.salesforceId || '',
    societe: userData.societe || '',
    manager_id: userData.managerId || '',
    actif: userData.actif !== undefined ? userData.actif : true,
  });
  return newRow;
}

async function updateUtilisateur(id, userData) {
  const current = await getUtilisateurByIdDB(id);
  if (!current) {
    throw new Error('Utilisateur introuvable');
  }

  if (userData.email) {
    const autre = await getUtilisateurByEmailDB(userData.email);
    if (autre && autre.id !== id) {
      throw new Error('Cet email est déjà utilisé');
    }
  }

  const payload = {
    email: userData.email !== undefined ? userData.email : current.email,
    nom: userData.nom !== undefined ? userData.nom : current.nom,
    prenom: userData.prenom !== undefined ? userData.prenom : current.prenom,
    role: userData.role !== undefined ? userData.role : current.role,
    salesforceId:
      userData.salesforceId !== undefined ? userData.salesforceId : current.salesforceId,
    societe: userData.societe !== undefined ? userData.societe : current.societe,
    managerId: userData.managerId !== undefined ? userData.managerId : current.managerId,
    actif: userData.actif !== undefined ? userData.actif : current.actif,
  };

  let password_hash;
  if (userData.password) {
    password_hash = await bcrypt.hash(userData.password, 10);
  }

  await updateUtilisateurDB(id, {
    ...payload,
    ...(password_hash !== undefined ? { password_hash } : {}),
  });
  return getUtilisateurByIdDB(id);
}

async function deleteUtilisateur(id) {
  const user = await getUtilisateurByIdDB(id);
  if (user && user.email === 'admin@g2l.fr') {
    throw new Error("Impossible de supprimer l'administrateur principal");
  }
  await deleteUtilisateurDB(id);
  return { success: true };
}

async function toggleUtilisateurActif(id) {
  return toggleActifDB(id);
}

async function getStatistiquesUtilisateurs() {
  const utilisateursListe = await getUtilisateursDB();
  const total = utilisateursListe.length;
  const actifs = utilisateursListe.filter((u) => u.actif !== false).length;
  const inactifs = total - actifs;

  const parRole = {};
  utilisateursListe.forEach((u) => {
    if (!parRole[u.role]) {
      parRole[u.role] = { count: 0, actifs: 0 };
    }
    parRole[u.role].count++;
    if (u.actif !== false) {
      parRole[u.role].actifs++;
    }
  });

  return {
    total,
    actifs,
    inactifs,
    parRole,
  };
}

function getRoles() {
  return [
    { value: 'ADMIN', label: 'Administrateur' },
    { value: 'RH', label: 'RH' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'COMPTABLE', label: 'Comptable' },
    { value: 'GESTIONNAIRE_PARC', label: 'Gestionnaire Parc' },
    { value: 'EXPLOITATION', label: 'Exploitation' },
    { value: 'EMPLOYE', label: 'Employé' },
  ];
}

async function getPermissions(utilisateurId) {
  return getPermissionsDB(utilisateurId);
}

async function setPermission(utilisateurId, module, action, autorise) {
  return setPermissionDB(utilisateurId, module, action, autorise);
}

async function seedAdminIfEmpty() {
  if (!pool) {
    console.warn('[AUTH] seedAdminIfEmpty : pas de DATABASE_URL, ignoré');
    return;
  }
  try {
    const n = await countUtilisateursDB();
    if (n > 0) return;

    const password_hash = await bcrypt.hash('admin123', 10);
    await createUtilisateurDB({
      id: 'USER_ADMIN_001',
      email: 'admin@g2l.fr',
      password_hash,
      nom: 'Administrateur',
      prenom: '',
      role: 'ADMIN',
      salesforce_id: null,
      societe: null,
      manager_id: null,
      actif: true,
    });
    console.log('[AUTH] Compte admin par défaut créé (admin@g2l.fr)');
  } catch (e) {
    console.error('[AUTH] seedAdminIfEmpty :', e.message || e);
  }
}

module.exports = {
  login,
  logout,
  verifierSession,
  getUserById,
  getManagerOfEmploye,
  peutValiderAbsence,
  ajouterUtilisateur,
  getUtilisateurs,
  getAllUtilisateurs,
  getUtilisateurById,
  createUtilisateur,
  updateUtilisateur,
  deleteUtilisateur,
  toggleUtilisateurActif,
  getStatistiquesUtilisateurs,
  getRoles,
  getPermissions,
  setPermission,
  seedAdminIfEmpty,
  utilisateurs,
};

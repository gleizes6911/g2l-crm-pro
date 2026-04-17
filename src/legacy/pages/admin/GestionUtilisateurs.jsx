import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Users, Plus, Search, Edit, Trash2, Lock, Unlock, 
  Mail, Key, UserCircle, Shield, CheckCircle, XCircle,
  AlertTriangle, Save, X, Eye, EyeOff
} from 'lucide-react';
import API_BASE from '../../config/api';

const GestionUtilisateurs = () => {
  const { user } = useAuth();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [stats, setStats] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtreRole, setFiltreRole] = useState('TOUS');
  const [filtreStatut, setFiltreStatut] = useState('TOUS');
  
  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState(null);
  const [modalDelete, setModalDelete] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nom: '',
    prenom: '',
    role: 'EMPLOYE',
    salesforceId: '',
    societe: '',
    managerId: ''
  });
  
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [usersRes, statsRes, rolesRes] = await Promise.all([
        fetch(`${API_BASE}/api/utilisateurs`),
        fetch(`${API_BASE}/api/utilisateurs/stats`),
        fetch(`${API_BASE}/api/roles`)
      ]);
      
      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      const rolesData = await rolesRes.json();
      
      setUtilisateurs(usersData);
      setStats(statsData);
      setRoles(rolesData);
      setLoading(false);
    } catch (err) {
      console.error('Erreur:', err);
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }
    
    if ((!modalEdit && !formData.password) || (formData.password && formData.password.length < 6)) {
      newErrors.password = 'Minimum 6 caractères';
    }
    
    if (!formData.nom || formData.nom.trim().length < 2) {
      newErrors.nom = 'Nom requis (min 2 caractères)';
    }
    
    if (!formData.prenom || formData.prenom.trim().length < 2) {
      newErrors.prenom = 'Prénom requis (min 2 caractères)';
    }
    
    if (!formData.role) {
      newErrors.role = 'Rôle requis';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/utilisateurs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || 'Erreur lors de la création');
        return;
      }
      
      setModalCreate(false);
      resetForm();
      fetchData();
      alert('Utilisateur créé avec succès !');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la création');
    }
  };

  const handleUpdate = async () => {
    if (!validateForm()) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/utilisateurs/${modalEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || 'Erreur lors de la modification');
        return;
      }
      
      setModalEdit(null);
      resetForm();
      fetchData();
      alert('Utilisateur modifié avec succès !');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la modification');
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/utilisateurs/${modalDelete.id}`, {
        method: 'DELETE'
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || 'Erreur lors de la suppression');
        return;
      }
      
      setModalDelete(null);
      fetchData();
      alert('Utilisateur supprimé avec succès !');
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la suppression');
    }
  };

  const handleToggleActif = async (utilisateur) => {
    try {
      const response = await fetch(`${API_BASE}/api/utilisateurs/${utilisateur.id}/toggle-actif`, {
        method: 'PATCH'
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        alert(result.error || 'Erreur');
        return;
      }
      
      fetchData();
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la modification');
    }
  };

  const openEditModal = (utilisateur) => {
    setFormData({
      email: utilisateur.email,
      password: '',
      nom: utilisateur.nom,
      prenom: utilisateur.prenom || '',
      role: utilisateur.role,
      salesforceId: utilisateur.salesforceId || '',
      societe: utilisateur.societe || '',
      managerId: utilisateur.managerId || ''
    });
    setModalEdit(utilisateur);
    setErrors({});
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      nom: '',
      prenom: '',
      role: 'EMPLOYE',
      salesforceId: '',
      societe: '',
      managerId: ''
    });
    setErrors({});
  };

  const filteredUtilisateurs = utilisateurs.filter(u => {
    const matchSearch = 
      u.nomComplet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchRole = filtreRole === 'TOUS' || u.role === filtreRole;
    const matchStatut = filtreStatut === 'TOUS' || 
      (filtreStatut === 'ACTIF' && u.actif) ||
      (filtreStatut === 'INACTIF' && !u.actif);
    
    return matchSearch && matchRole && matchStatut;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              Gestion des utilisateurs
            </h1>
            <p className="text-gray-600 mt-1">Créer, modifier et gérer les comptes utilisateurs</p>
          </div>
          
          <button
            onClick={() => {
              resetForm();
              setModalCreate(true);
            }}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouvel utilisateur
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<Users className="w-6 h-6 text-blue-600" />}
            label="Total"
            value={stats.total}
            color="blue"
          />
          <StatCard
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
            label="Actifs"
            value={stats.actifs}
            color="green"
          />
          <StatCard
            icon={<XCircle className="w-6 h-6 text-red-600" />}
            label="Inactifs"
            value={stats.inactifs}
            color="red"
          />
          <StatCard
            icon={<Shield className="w-6 h-6 text-purple-600" />}
            label="Admins"
            value={stats.parRole.ADMIN?.count || 0}
            color="purple"
          />
          <StatCard
            icon={<UserCircle className="w-6 h-6 text-indigo-600" />}
            label="Employés"
            value={stats.parRole.EMPLOYE?.count || 0}
            color="indigo"
          />
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Rechercher
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nom, prénom, email..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rôle
            </label>
            <select
              value={filtreRole}
              onChange={(e) => setFiltreRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Tous les rôles</option>
              {roles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Statut
            </label>
            <select
              value={filtreStatut}
              onChange={(e) => setFiltreStatut(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="TOUS">Tous les statuts</option>
              <option value="ACTIF">Actifs</option>
              <option value="INACTIF">Inactifs</option>
            </select>
          </div>
        </div>
      </div>

      {/* Liste utilisateurs */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Utilisateur</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Créé le</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUtilisateurs.map(utilisateur => (
                <UserRow
                  key={utilisateur.id}
                  utilisateur={utilisateur}
                  onEdit={openEditModal}
                  onDelete={setModalDelete}
                  onToggleActif={handleToggleActif}
                  currentUserId={user.userId}
                />
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredUtilisateurs.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Aucun utilisateur trouvé</p>
          </div>
        )}
      </div>

      {/* Modal Create */}
      {modalCreate && (
        <UserModal
          title="Créer un utilisateur"
          formData={formData}
          setFormData={setFormData}
          errors={errors}
          roles={roles}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          onSave={handleCreate}
          onClose={() => {
            setModalCreate(false);
            resetForm();
          }}
          isEdit={false}
        />
      )}

      {/* Modal Edit */}
      {modalEdit && (
        <UserModal
          title="Modifier un utilisateur"
          formData={formData}
          setFormData={setFormData}
          errors={errors}
          roles={roles}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          onSave={handleUpdate}
          onClose={() => {
            setModalEdit(null);
            resetForm();
          }}
          isEdit={true}
        />
      )}

      {/* Modal Delete */}
      {modalDelete && (
        <DeleteModal
          utilisateur={modalDelete}
          onConfirm={handleDelete}
          onClose={() => setModalDelete(null)}
        />
      )}
    </div>
  );
};

// Composant StatCard
const StatCard = ({ icon, label, value, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    purple: 'bg-purple-50 border-purple-200',
    indigo: 'bg-indigo-50 border-indigo-200'
  };

  return (
    <div className={`${colorClasses[color]} border rounded-lg p-4`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
};

// Composant UserRow
const UserRow = ({ utilisateur, onEdit, onDelete, onToggleActif, currentUserId }) => {
  const getRoleBadge = (role) => {
    const badges = {
      ADMIN: 'bg-purple-100 text-purple-800',
      RH: 'bg-blue-100 text-blue-800',
      MANAGER: 'bg-green-100 text-green-800',
      COMPTABLE: 'bg-indigo-100 text-indigo-800',
      GESTIONNAIRE_PARC: 'bg-orange-100 text-orange-800',
      EMPLOYE: 'bg-gray-100 text-gray-800'
    };
    return badges[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleLabel = (role) => {
    const labels = {
      ADMIN: 'Admin',
      RH: 'RH',
      MANAGER: 'Manager',
      COMPTABLE: 'Comptable',
      GESTIONNAIRE_PARC: 'Gestionnaire Parc',
      EMPLOYE: 'Employé'
    };
    return labels[role] || role;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('fr-FR');
    } catch {
      return 'N/A';
    }
  };

  const isCurrentUser = utilisateur.id === currentUserId;
  const canDelete = !isCurrentUser && utilisateur.email !== 'admin@g2l.fr';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <UserCircle className="w-8 h-8 text-gray-400 mr-3" />
          <div>
            <p className="font-medium text-gray-900">{utilisateur.nomComplet}</p>
            {utilisateur.societe && (
              <p className="text-sm text-gray-500">{utilisateur.societe}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center text-sm text-gray-600">
          <Mail className="w-4 h-4 mr-2" />
          {utilisateur.email}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getRoleBadge(utilisateur.role)}`}>
          {getRoleLabel(utilisateur.role)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {utilisateur.actif !== false ? (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800 flex items-center gap-1 w-fit">
            <CheckCircle className="w-3 h-3" />
            Actif
          </span>
        ) : (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 flex items-center gap-1 w-fit">
            <XCircle className="w-3 h-3" />
            Inactif
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
        {formatDate(utilisateur.createdAt)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onToggleActif(utilisateur)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={utilisateur.actif !== false ? 'Désactiver' : 'Activer'}
          >
            {utilisateur.actif !== false ? (
              <Lock className="w-4 h-4 text-orange-600" />
            ) : (
              <Unlock className="w-4 h-4 text-green-600" />
            )}
          </button>
          <button
            onClick={() => onEdit(utilisateur)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Modifier"
          >
            <Edit className="w-4 h-4 text-blue-600" />
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(utilisateur)}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4 text-red-600" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};

// Composant UserModal
const UserModal = ({ title, formData, setFormData, errors, roles, showPassword, setShowPassword, onSave, onClose, isEdit }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom *
              </label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg ${errors.nom ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.nom && <p className="text-red-500 text-xs mt-1">{errors.nom}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Prénom *
              </label>
              <input
                type="text"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg ${errors.prenom ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.prenom && <p className="text-red-500 text-xs mt-1">{errors.prenom}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isEdit ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                {showPassword ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
              </button>
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rôle *
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className={`w-full px-4 py-2 border rounded-lg ${errors.role ? 'border-red-500' : 'border-gray-300'}`}
            >
              {roles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID Salesforce
            </label>
            <input
              type="text"
              value={formData.salesforceId}
              onChange={(e) => setFormData({ ...formData, salesforceId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Société
            </label>
            <input
              type="text"
              value={formData.societe}
              onChange={(e) => setFormData({ ...formData, societe: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Annuler
          </button>
          <button
            onClick={onSave}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-5 h-5" />
            {isEdit ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant DeleteModal
const DeleteModal = ({ utilisateur, onConfirm, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Supprimer l'utilisateur</h2>
              <p className="text-sm text-gray-600">Cette action est irréversible</p>
            </div>
          </div>

          <p className="text-gray-700 mb-6">
            Êtes-vous sûr de vouloir supprimer <strong>{utilisateur.nomComplet}</strong> ({utilisateur.email}) ?
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GestionUtilisateurs;


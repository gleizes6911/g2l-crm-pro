import React, { useState, useEffect } from 'react';
import { AlertCircle, User, Download, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import API_BASE from '../../config/api';
const CATEGORIES_COLORS = {
  CNI: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  PERMIS: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  CONTRAT: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  AVENANT: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  FICHE_PAIE: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  DIPLOME: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  FORMATION: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  VISITE_MEDICALE: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  RIB: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  AUTRE: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }
};

export default function DocumentsEmploye({ employe, documents, onValider, onDelete, user }) {
  const [alertes, setAlertes] = useState([]);
  const [manquants, setManquants] = useState([]);
  
  useEffect(() => {
    fetch(`${API_BASE}/api/documents/employe/${employe.id}/alertes`)
      .then(res => res.json())
      .then(data => setAlertes(data || []))
      .catch(() => setAlertes([]));
    
    fetch(`${API_BASE}/api/documents/employe/${employe.id}/manquants`)
      .then(res => res.json())
      .then(data => setManquants(data || []))
      .catch(() => setManquants([]));
  }, [employe.id]);
  
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      {/* Header employé */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{employe.nomComplet}</h3>
            <p className="text-sm text-gray-600">{employe.societe}</p>
          </div>
        </div>
        
        {/* Alertes */}
        {(alertes.length > 0 || manquants.length > 0) && (
          <div className="flex items-center gap-2">
            {alertes.length > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                <AlertCircle className="w-4 h-4" />
                {alertes.length} alerte(s)
              </div>
            )}
            {manquants.length > 0 && (
              <div className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-semibold">
                <AlertCircle className="w-4 h-4" />
                {manquants.length} manquant(s)
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Liste documents */}
      <div className="space-y-3">
        {documents.map(doc => {
          const categorieColor = CATEGORIES_COLORS[doc.categorie] || CATEGORIES_COLORS.AUTRE;
          const estExpire = doc.dateExpiration && new Date(doc.dateExpiration) < new Date();
          const expireBientot = doc.dateExpiration && 
            new Date(doc.dateExpiration) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          
          return (
            <div 
              key={doc.id} 
              className={`p-4 rounded-lg border-2 ${categorieColor.border} ${estExpire ? 'bg-red-50' : expireBientot ? 'bg-orange-50' : 'bg-gray-50'} hover:shadow-md transition-all`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${categorieColor.bg} ${categorieColor.text}`}>
                      {doc.categorie}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      doc.statut === 'Validé' ? 'bg-green-100 text-green-800' :
                      doc.statut === 'Refusé' ? 'bg-red-100 text-red-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                      {doc.statut}
                    </span>
                    {estExpire && (
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold">
                        ⚠️ EXPIRÉ
                      </span>
                    )}
                    {expireBientot && !estExpire && (
                      <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-bold">
                        ⚠️ Expire bientôt
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-700 mb-1">{doc.description || 'Aucune description'}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                    <span>Fichier: {doc.originalName}</span>
                    {doc.dateExpiration && (
                      <span className={estExpire ? 'text-red-600 font-bold' : expireBientot ? 'text-orange-600 font-semibold' : ''}>
                        Expire: {format(new Date(doc.dateExpiration), 'dd/MM/yyyy', { locale: fr })}
                      </span>
                    )}
                    {doc.valideParNom && (
                      <span>Validé par: {doc.valideParNom}</span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <a
                    href={`${API_BASE}/api/documents/${doc.id}/download`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  
                  {(user?.role === 'RH' || user?.role === 'MANAGER') && doc.statut === 'En attente validation' && (
                    <button
                      onClick={() => onValider(doc)}
                      className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                      title="Valider/Refuser"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                  )}
                  
                  {(user?.role === 'RH' || user?.role === 'MANAGER') && (
                    <button
                      onClick={() => onDelete(doc.id)}
                      className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


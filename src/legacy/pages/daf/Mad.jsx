import { useState } from 'react'
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'
import API_BASE from '../../config/api';
export default function Mad() {
  const [activeTab, setActiveTab] = useState('KPI')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateDebut, setDateDebut] = useState('2025-10-01')
  const [dateFin, setDateFin] = useState('2025-11-30')
  const [societePreteur, setSocietePreteur] = useState('')
  const [societeEmprunteur, setSocieteEmprunteur] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalData, setModalData] = useState(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [filtres, setFiltres] = useState({
    chauffeur: '',
    vehicule: '',
    chargeur: '',
    societePreteuse: '',
    societeEmprunteuse: ''
  })

  const handleAnalyser = async () => {
    setLoading(true)
    
    try {
      const response = await fetch(`${API_BASE}/api/mad/analyse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateDebut,
          dateFin,
          societePreteur,
          societeEmprunteur,
          environment: 'production'
        })
      })
      
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }
      
      const data = await response.json()
      
      console.log('═══════════════════════════════════════════════════════')
      console.log('🔍 DEBUG RÉSULTATS API')
      console.log('═══════════════════════════════════════════════════════')
      console.log('Results complets:', data)
      console.log('Totaux employés:', data.totaux?.employes)
      console.log('Totaux véhicules:', data.totaux?.vehicules)
      console.log('Chauffeurs:', data.chauffeurs?.length)
      console.log('Véhicules:', data.vehicules?.length)
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔍 VÉRIFICATION DETAILS');
      console.log('═══════════════════════════════════════════════════════');
      console.log('Premier chauffeur:', data.chauffeurs?.[0]);
      console.log('A des details ?', data.chauffeurs?.[0]?.details);
      console.log('Nombre de details:', data.chauffeurs?.[0]?.details?.length);
      if (data.chauffeurs?.[0]?.details?.[0]) {
        console.log('Premier detail:', data.chauffeurs[0].details[0]);
      }
      console.log('---');
      console.log('Premier véhicule:', data.vehicules?.[0]);
      console.log('A des details ?', data.vehicules?.[0]?.details);
      console.log('Nombre de details:', data.vehicules?.[0]?.details?.length);
      if (data.vehicules?.[0]?.details?.[0]) {
        console.log('Premier detail véhicule:', data.vehicules[0].details[0]);
      }
      console.log('═══════════════════════════════════════════════════════');
      
      setResults(data)
      setActiveTab('KPI') // Basculer vers l'onglet KPI après l'analyse
      
    } catch (error) {
      console.error('Erreur analyse:', error)
      console.error('Détails erreur:', error.message)
      alert(`Erreur lors de l'analyse: ${error.message}`)
      setResults(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExportExcel = () => {
    // TODO: Implémenter l'export Excel
    alert('Export Excel à implémenter')
  }

  const handleChauffeurClick = async (chauffeur, employeur, societeBeneficiaire) => {
    setModalOpen(true)
    setModalLoading(true)
    setModalData(null)

    try {
      const response = await fetch(
        `${API_BASE}/api/mad/chauffeur-detail?chauffeur=${encodeURIComponent(chauffeur)}&dateDebut=${dateDebut}&dateFin=${dateFin}&environment=production`
      )

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      setModalData({
        ...data,
        societeBeneficiaire, // Ajouter le bénéficiaire pour l'affichage
        type: 'chauffeur' // Type pour différencier chauffeur/véhicule
      })
    } catch (error) {
      console.error('Erreur chargement détails:', error)
      alert(`Erreur lors du chargement des détails: ${error.message}`)
      setModalOpen(false)
    } finally {
      setModalLoading(false)
    }
  }

  const handleVehiculeClick = async (vehicule, porteuse, societeBeneficiaire) => {
    setModalOpen(true)
    setModalLoading(true)
    setModalData(null)

    try {
      const response = await fetch(
        `${API_BASE}/api/mad/vehicule-detail?vehicule=${encodeURIComponent(vehicule)}&dateDebut=${dateDebut}&dateFin=${dateFin}&environment=production`
      )

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`)
      }

      const data = await response.json()
      setModalData({
        ...data,
        societeBeneficiaire, // Ajouter le bénéficiaire pour l'affichage
        type: 'vehicule' // Type pour différencier chauffeur/véhicule
      })
    } catch (error) {
      console.error('Erreur chargement détails véhicule:', error)
      alert(`Erreur lors du chargement des détails: ${error.message}`)
      setModalOpen(false)
    } finally {
      setModalLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // ═══════════════════════════════════════════════════════════
  // FONCTION DE FILTRAGE
  // ═══════════════════════════════════════════════════════════
  const appliquerFiltres = (data, type) => {
    if (!data || !Array.isArray(data)) return []
    
    return data.filter(item => {
      // Filtre chauffeur
      if (filtres.chauffeur && type === 'chauffeur' && item.chauffeur !== filtres.chauffeur) {
        return false
      }
      
      // Filtre véhicule
      if (filtres.vehicule && type === 'vehicule' && item.vehicule !== filtres.vehicule) {
        return false
      }
      
      // Filtre chargeur (si les données contiennent des chargeurs)
      if (filtres.chargeur) {
        // Pour l'instant, on ne filtre pas sur chargeur car pas dans les données de base
        // À implémenter si nécessaire avec les détails
      }
      
      // Filtre société prêteuse
      if (filtres.societePreteuse) {
        const societe = type === 'chauffeur' ? item.employeur : item.porteuse
        if (societe !== filtres.societePreteuse) {
          return false
        }
      }
      
      // Filtre société emprunteuse
      if (filtres.societeEmprunteuse) {
        if (item.societeBeneficiaire !== filtres.societeEmprunteuse) {
          return false
        }
      }
      
      return true
    })
  }

  const getIndicateurCouleur = (pourcentage) => {
    if (pourcentage > 80) return '🔴'
    if (pourcentage > 50) return '🟠'
    if (pourcentage > 20) return '🟡'
    return '🟢'
  }

  const getCouleurJauge = (pourcentage) => {
    if (pourcentage > 50) return 'bg-red-500'
    if (pourcentage > 30) return 'bg-orange-500'
    if (pourcentage > 10) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  // ═══════════════════════════════════════════════════════════
  // CALCUL DES KPI
  // ═══════════════════════════════════════════════════════════
  const calculerKPI = () => {
    if (!results || !results.chauffeurs || !results.vehicules) return null

    // Appliquer les filtres
    const chauffeursFiltres = appliquerFiltres(results.chauffeurs, 'chauffeur')
    const vehiculesFiltres = appliquerFiltres(results.vehicules, 'vehicule')

    // CHAUFFEURS MAD
    const chauffeursMAD = chauffeursFiltres.filter(c => 
      c.employeur !== c.societeBeneficiaire &&
      c.employeur !== 'N/A' &&
      c.societeBeneficiaire !== 'N/A' &&
      (c.joursMAD || c.joursEquivalents || 0) > 0
    )
    const nbChauffeursMAD = new Set(chauffeursMAD.map(c => c.chauffeur)).size
    const totalJoursMADChauffeurs = chauffeursMAD.reduce((sum, c) => 
      sum + (c.joursMAD || c.joursEquivalents || 0), 0
    )
    
    // Total chauffeurs (depuis results.totaux.employes)
    const totalChauffeurs = Object.values(results.totaux?.employes || {}).reduce((a, b) => a + (b || 0), 0)
    const pourcentageChauffeurs = totalChauffeurs > 0 
      ? ((nbChauffeursMAD / totalChauffeurs) * 100).toFixed(1) 
      : 0

    // VÉHICULES MAD
    const vehiculesMAD = vehiculesFiltres.filter(v => 
      v.porteuse !== v.societeBeneficiaire &&
      v.porteuse !== 'N/A' &&
      v.societeBeneficiaire !== 'N/A' &&
      (v.joursMAD || v.joursEquivalents || 0) > 0
    )
    const nbVehiculesMAD = new Set(vehiculesMAD.map(v => v.vehicule)).size
    const totalJoursMADVehicules = vehiculesMAD.reduce((sum, v) => 
      sum + (v.joursMAD || v.joursEquivalents || 0), 0
    )
    
    // Total véhicules (depuis results.totaux.vehicules)
    const totalVehicules = Object.values(results.totaux?.vehicules || {}).reduce((a, b) => a + (b || 0), 0)
    const pourcentageVehicules = totalVehicules > 0 
      ? ((nbVehiculesMAD / totalVehicules) * 100).toFixed(1) 
      : 0

    // JOURS TOTAUX
    const totalJoursCombines = totalJoursMADChauffeurs + totalJoursMADVehicules

    // SOCIÉTÉS
    const societesPreteurs = new Set([
      ...chauffeursMAD.map(c => c.employeur),
      ...vehiculesMAD.map(v => v.porteuse)
    ]).size
    const societesEmprunteurs = new Set([
      ...chauffeursMAD.map(c => c.societeBeneficiaire),
      ...vehiculesMAD.map(v => v.societeBeneficiaire)
    ]).size

    return {
      nbChauffeursMAD,
      totalJoursMADChauffeurs,
      totalChauffeurs,
      pourcentageChauffeurs,
      nbVehiculesMAD,
      totalJoursMADVehicules,
      totalVehicules,
      pourcentageVehicules,
      totalJoursCombines,
      societesPreteurs,
      societesEmprunteurs
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VÉRIFIER SI ON AFFICHE LES GRAPHIQUES MENSUELS
  // ═══════════════════════════════════════════════════════════
  const afficherGraphiquesMensuels = () => {
    if (!dateDebut || !dateFin) return false
    const debut = new Date(dateDebut)
    const fin = new Date(dateFin)
    const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth())
    return diffMois >= 1 // Afficher si période >= 2 mois
  }

  // ═══════════════════════════════════════════════════════════
  // CALCUL DES DONNÉES MENSUELLES (utilise les détails réels)
  // ═══════════════════════════════════════════════════════════
  const calculerDonneesMensuelles = () => {
    if (!results || !results.chauffeurs || !results.vehicules) return []
    
    // Appliquer les filtres
    const chauffeursFiltres = appliquerFiltres(results.chauffeurs, 'chauffeur')
    const vehiculesFiltres = appliquerFiltres(results.vehicules, 'vehicule')
    
    // Vérifier si on a plusieurs mois
    const debut = new Date(dateDebut)
    const fin = new Date(dateFin)
    const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth())
    
    if (diffMois < 1) return []
    
    // Initialiser les données mensuelles
    const donneesMensuelles = {}
    
    // Générer tous les mois entre début et fin
    const moisCourant = new Date(debut.getFullYear(), debut.getMonth(), 1)
    const finMois = new Date(fin.getFullYear(), fin.getMonth(), 1)
    
    while (moisCourant <= finMois) {
      const moisKey = moisCourant.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
      donneesMensuelles[moisKey] = {
        mois: moisKey,
        joursMADChauffeurs: 0,
        joursMADVehicules: 0,
        totalChauffeurs: 0,
        totalVehicules: 0,
        nbChauffeursUniques: new Set(),
        nbVehiculesUniques: new Set()
      }
      moisCourant.setMonth(moisCourant.getMonth() + 1)
    }
    
    // Compter les chauffeurs par mois en parcourant les DETAILS
    chauffeursFiltres.forEach(chauffeur => {
      if (!chauffeur.details || chauffeur.details.length === 0) return
      
      chauffeur.details.forEach(detail => {
        if (!detail.date) return
        
        const dateDetail = new Date(detail.date)
        const moisKey = dateDetail.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
        
        if (donneesMensuelles[moisKey]) {
          // Ajouter les jours MAD uniquement si estMAD est true
          if (detail.estMAD) {
            donneesMensuelles[moisKey].joursMADChauffeurs += detail.joursMAD || 0
          }
          // Le total inclut tous les jours
          donneesMensuelles[moisKey].totalChauffeurs += detail.joursTotal || 0
          // Compter les chauffeurs uniques pour ce mois
          donneesMensuelles[moisKey].nbChauffeursUniques.add(chauffeur.chauffeur)
        }
      })
    })
    
    // Même chose pour les véhicules
    vehiculesFiltres.forEach(vehicule => {
      if (!vehicule.details || vehicule.details.length === 0) return
      
      vehicule.details.forEach(detail => {
        if (!detail.date) return
        
        const dateDetail = new Date(detail.date)
        const moisKey = dateDetail.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
        
        if (donneesMensuelles[moisKey]) {
          if (detail.estMAD) {
            donneesMensuelles[moisKey].joursMADVehicules += detail.joursMAD || 0
          }
          donneesMensuelles[moisKey].totalVehicules += detail.joursTotal || 0
          // Compter les véhicules uniques pour ce mois
          donneesMensuelles[moisKey].nbVehiculesUniques.add(vehicule.vehicule)
        }
      })
    })
    
    // Calculer les totaux globaux pour les pourcentages
    const totalChauffeurs = Object.values(results.totaux?.employes || {}).reduce((a, b) => a + (b || 0), 0)
    const totalVehicules = Object.values(results.totaux?.vehicules || {}).reduce((a, b) => a + (b || 0), 0)
    
    // Convertir en tableau et calculer les pourcentages
    const tableauMensuel = Object.values(donneesMensuelles).map(mois => ({
      mois: mois.mois,
      joursMADChauffeurs: parseFloat(mois.joursMADChauffeurs.toFixed(1)),
      joursMADVehicules: parseFloat(mois.joursMADVehicules.toFixed(1)),
      tauxChauffeurs: totalChauffeurs > 0 
        ? parseFloat(((mois.nbChauffeursUniques.size / totalChauffeurs) * 100).toFixed(1))
        : 0,
      tauxVehicules: totalVehicules > 0
        ? parseFloat(((mois.nbVehiculesUniques.size / totalVehicules) * 100).toFixed(1))
        : 0
    }))
    
    console.log('📊 Données mensuelles calculées:', tableauMensuel)
    
    return tableauMensuel
  }


  const renderKPI = () => {
    if (!results || !results.chauffeurs || results.chauffeurs.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          Aucune donnée disponible. Lancez une analyse pour voir les KPI.
        </div>
      )
    }

    // ═══════════════════════════════════════════════════════════
    // KPI Vue d'ensemble (chauffeurs + véhicules)
    // ═══════════════════════════════════════════════════════════
    // Appliquer les filtres
    const chauffeursFiltres = appliquerFiltres(results.chauffeurs || [], 'chauffeur')
    const vehiculesFiltres = appliquerFiltres(results.vehicules || [], 'vehicule')
    
    const chauffeursMAD = chauffeursFiltres.filter(c =>
      c.employeur !== c.societeBeneficiaire &&
      c.employeur !== 'N/A' &&
      c.societeBeneficiaire !== 'N/A' &&
      (c.joursMAD || c.joursEquivalents || 0) > 0
    )
    const vehiculesMAD = vehiculesFiltres.filter(v =>
      v.porteuse !== v.societeBeneficiaire &&
      v.porteuse !== 'N/A' &&
      v.societeBeneficiaire !== 'N/A' &&
      (v.joursMAD || v.joursEquivalents || 0) > 0
    )

    const totalChauffeursMAD = new Set(chauffeursMAD.map(c => c.chauffeur)).size
    const totalVehiculesMAD = new Set(vehiculesMAD.map(v => v.vehicule)).size
    const joursTotauxChauffeursMAD = chauffeursMAD.reduce((sum, c) => sum + (c.joursMAD || c.joursEquivalents || 0), 0)
    const joursTotauxVehiculesMAD = vehiculesMAD.reduce((sum, v) => sum + (v.joursMAD || v.joursEquivalents || 0), 0)

    const totalEmployesGlobal = Object.values(results.totaux?.employes || {}).reduce((s, n) => s + (n || 0), 0)
    const totalVehiculesGlobal = Object.values(results.totaux?.vehicules || {}).reduce((s, n) => s + (n || 0), 0)

    // Top sociétés prêteuses / emprunteuses (chauffeurs MAD)
    const topPreteurs = Object.entries(
      chauffeursMAD.reduce((acc, c) => {
        acc[c.employeur] = (acc[c.employeur] || 0) + (c.joursMAD || c.joursEquivalents || 0)
        return acc
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 2)

    const topEmprunteurs = Object.entries(
      chauffeursMAD.reduce((acc, c) => {
        acc[c.societeBeneficiaire] = (acc[c.societeBeneficiaire] || 0) + (c.joursMAD || c.joursEquivalents || 0)
        return acc
      }, {})
    ).sort((a, b) => b[1] - a[1]).slice(0, 2)

    const kpis = [
      {
        icon: '👥',
        title: 'Chauffeurs en MAD',
        value: totalChauffeursMAD,
        subtitle: totalEmployesGlobal > 0
          ? `sur ${totalEmployesGlobal} employés (${((totalChauffeursMAD / totalEmployesGlobal) * 100).toFixed(1)}%)`
          : 'Total employés N/A',
        color: 'bg-blue-50 text-blue-700 border-blue-100'
      },
      {
        icon: '🚛',
        title: 'Véhicules en MAD',
        value: totalVehiculesMAD,
        subtitle: totalVehiculesGlobal > 0
          ? `sur ${totalVehiculesGlobal} véhicules (${((totalVehiculesMAD / totalVehiculesGlobal) * 100).toFixed(1)}%)`
          : 'Total véhicules N/A',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-100'
      },
      {
        icon: '🗓️',
        title: 'Jours MAD chauffeurs',
        value: joursTotauxChauffeursMAD.toFixed(1),
        subtitle: 'Cumul période filtrée',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-100'
      },
      {
        icon: '📅',
        title: 'Jours MAD véhicules',
        value: joursTotauxVehiculesMAD.toFixed(1),
        subtitle: 'Cumul période filtrée',
        color: 'bg-sky-50 text-sky-700 border-sky-100'
      },
      {
        icon: '📤',
        title: 'Top prêteurs',
        value: topPreteurs[0]?.[0] || 'N/A',
        subtitle: topPreteurs.length > 1 ? `${topPreteurs[1][0]} en 2ᵉ` : '—',
        color: 'bg-amber-50 text-amber-700 border-amber-100'
      },
      {
        icon: '📥',
        title: 'Top emprunteurs',
        value: topEmprunteurs[0]?.[0] || 'N/A',
        subtitle: topEmprunteurs.length > 1 ? `${topEmprunteurs[1][0]} en 2ᵉ` : '—',
        color: 'bg-lime-50 text-lime-700 border-lime-100'
      }
    ]

    // Calculer les KPI pour les 4 cartes
    const kpi = calculerKPI()
    const donneesMensuelles = afficherGraphiquesMensuels() ? calculerDonneesMensuelles() : []

    return (
      <div className="space-y-8">
        {/* Section KPI - 4 cartes */}
        <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-8 rounded-2xl shadow-lg border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <span>📊</span>
            <span>Vue d'ensemble</span>
          </h2>
          
          {kpi && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* CARTE 1 : CHAUFFEURS EN MAD */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-2">👥</div>
                <div className="text-5xl font-bold text-blue-600 mb-1">{kpi.nbChauffeursMAD}</div>
                <div className="text-sm text-gray-600">chauffeurs en MAD</div>
                <div className="text-xs text-gray-500 mt-2">
                  sur {kpi.totalChauffeurs} employés ({kpi.pourcentageChauffeurs}%)
                </div>
                <div className="text-xs font-semibold text-blue-600 mt-2">
                  {kpi.totalJoursMADChauffeurs.toFixed(1)} jours MAD
                </div>
              </div>

              {/* CARTE 2 : VÉHICULES EN MAD */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-2">🚛</div>
                <div className="text-5xl font-bold text-green-600 mb-1">{kpi.nbVehiculesMAD}</div>
                <div className="text-sm text-gray-600">véhicules en MAD</div>
                <div className="text-xs text-gray-500 mt-2">
                  sur {kpi.totalVehicules} véhicules ({kpi.pourcentageVehicules}%)
                </div>
                <div className="text-xs font-semibold text-green-600 mt-2">
                  {kpi.totalJoursMADVehicules.toFixed(1)} jours MAD
                </div>
              </div>

              {/* CARTE 3 : JOURS TOTAUX MAD */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-2">📅</div>
                <div className="text-5xl font-bold text-purple-600 mb-1">{kpi.totalJoursCombines.toFixed(0)}</div>
                <div className="text-sm text-gray-600">jours MAD totaux</div>
                <div className="text-xs text-gray-500 mt-2">
                  Chauffeurs : {kpi.totalJoursMADChauffeurs.toFixed(1)} jours
                </div>
                <div className="text-xs text-gray-500">
                  Véhicules : {kpi.totalJoursMADVehicules.toFixed(1)} jours
                </div>
              </div>

              {/* CARTE 4 : SOCIÉTÉS */}
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-2">💼</div>
                <div className="text-5xl font-bold text-orange-600 mb-1">
                  {kpi.societesPreteurs}→{kpi.societesEmprunteurs}
                </div>
                <div className="text-sm text-gray-600">sociétés concernées</div>
                <div className="text-xs text-gray-500 mt-2">
                  {kpi.societesPreteurs} société(s) prêteuse(s)
                </div>
                <div className="text-xs text-gray-500">
                  {kpi.societesEmprunteurs} société(s) emprunteuse(s)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section Graphiques mensuels - SI plusieurs mois */}
        {donneesMensuelles && donneesMensuelles.length > 0 && (
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
              <span>📈</span>
              <span>Évolution Mensuelle</span>
            </h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* GRAPHIQUE 1 : BARRES - JOURS MAD PAR MOIS */}
              <div className="bg-gradient-to-br from-blue-50 to-green-50 p-6 rounded-xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <span>📊</span>
                  <span>Évolution des jours MAD par mois</span>
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={donneesMensuelles}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mois" />
                    <YAxis label={{ value: 'Jours', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="joursMADChauffeurs" fill="#3B82F6" name="Chauffeurs" />
                    <Bar dataKey="joursMADVehicules" fill="#10B981" name="Véhicules" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* GRAPHIQUE 2 : LIGNES - TAUX MAD PAR MOIS */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <span>📈</span>
                  <span>Taux de mise à disposition mensuel</span>
                </h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={donneesMensuelles}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mois" />
                    <YAxis label={{ value: 'Pourcentage (%)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="tauxChauffeurs" 
                      stroke="#3B82F6" 
                      strokeWidth={3}
                      name="% Chauffeurs" 
                      dot={{ fill: '#3B82F6', r: 5 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="tauxVehicules" 
                      stroke="#10B981" 
                      strokeWidth={3}
                      name="% Véhicules" 
                      dot={{ fill: '#10B981', r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderStatsVehicules = () => {
    if (!results || !results.vehicules || results.vehicules.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          Aucune mise à disposition de véhicule trouvée pour cette période
        </div>
      )
    }

    // Appliquer les filtres
    const vehiculesFiltres = appliquerFiltres(results.vehicules || [], 'vehicule')

    // ═══════════════════════════════════════════════════════════
    // DEBUG DONNÉES VÉHICULES
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DEBUG DONNÉES VÉHICULES');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Données véhicules:', vehiculesFiltres);
    console.log('Véhicules génériques:', vehiculesFiltres?.filter(v => v.estGenerique));
    console.log('═══════════════════════════════════════════════════════');

    // Filtrer uniquement les véhicules en MAD
    const vehiculesMAD = vehiculesFiltres.filter(v =>
      v.porteuse !== v.societeBeneficiaire &&
      v.porteuse !== 'N/A' &&
      v.societeBeneficiaire !== 'N/A' &&
      (v.joursMAD || v.joursEquivalents || 0) > 0
    );

    if (vehiculesMAD.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          Aucune mise à disposition de véhicule trouvée pour cette période
        </div>
      )
    }

    // Grouper par porteuse + bénéficiaire
    const groupesParPorteuseBeneficiaire = {};
    
    vehiculesMAD.forEach(v => {
      const cle = `${v.porteuse}|${v.societeBeneficiaire}`;
      if (!groupesParPorteuseBeneficiaire[cle]) {
        groupesParPorteuseBeneficiaire[cle] = {
          porteuse: v.porteuse,
          societeBeneficiaire: v.societeBeneficiaire,
          vehicules: []
        };
      }
      groupesParPorteuseBeneficiaire[cle].vehicules.push(v);
    });

    return (
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <span className="text-3xl">🚛</span>
          Véhicules en mise à disposition
        </h2>

        {/* Tableaux par porteuse et bénéficiaire */}
        {Object.values(groupesParPorteuseBeneficiaire)
          .sort((a, b) => {
            const uniquesA = [...new Set(a.vehicules.map(v => v.vehicule))].length;
            const uniquesB = [...new Set(b.vehicules.map(v => v.vehicule))].length;
            return uniquesB - uniquesA;
          })
          .map((groupe, idx) => {
            const { porteuse, societeBeneficiaire, vehicules } = groupe;
            
            const vehiculesUniques = [...new Set(vehicules.map(v => v.vehicule))];
            const nombreVehicules = vehiculesUniques.length;
            const vehiculesGeneriques = vehicules.filter(v => v.estGenerique);
            const nombreGeneriques = vehiculesGeneriques.length;
            const totalVehicules = results.totaux?.vehicules?.[porteuse] || 0;
            const tauxGlobal = totalVehicules > 0 
              ? (nombreVehicules / totalVehicules) * 100 
              : 0;
            
            const joursTotauxMad = vehicules.reduce((s, v) => 
              s + (v.joursEquivalents || v.joursMAD || 0), 0
            );

              return (
                <div key={`${porteuse}-${societeBeneficiaire}-${idx}`} className="mb-12">
                  <div className="bg-green-50 border-l-4 border-green-500 p-5 rounded-lg mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      🚛 {porteuse} vers {societeBeneficiaire}: {nombreVehicules} véhicule{nombreVehicules !== 1 ? 's' : ''}
                    </h3>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• {nombreVehicules} véhicule(s) concerné(s)</li>
                      {nombreGeneriques > 0 && (
                        <li className="text-yellow-700 font-medium">
                          • dont {nombreGeneriques} véhicule{nombreGeneriques !== 1 ? 's' : ''} générique{nombreGeneriques !== 1 ? 's' : ''} ⚠️
                        </li>
                      )}
                      <li>• Jours totaux MAD : {joursTotauxMad.toFixed(1)} jours</li>
                      <li>
                        • Taux global : {tauxGlobal.toFixed(1)}% de la flotte 
                        ({nombreVehicules}/{totalVehicules} véhicules)
                      </li>
                    </ul>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                            Véhicule
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                            Société porteuse
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                            Société bénéficiaire
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                            Jours utilisés
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                            Jours MAD
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                            % MAD
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicules
                          .sort((a, b) => (b.pourcentageMAD || b.pourcentage || 0) - (a.pourcentageMAD || a.pourcentage || 0))
                          .map((v, vIdx) => {
                            const joursMad = v.joursMAD || v.joursEquivalents || 0;
                            const joursUtilises = v.joursTotal || joursMad || 0;
                            const pct = v.pourcentageMAD || v.pourcentage || 0;
                            const indicateur = getIndicateurCouleur(pct);
                            const estGenerique = v.estGenerique || false;
                            const pctSuperieur100 = pct > 100;

                            return (
                              <tr
                                key={`${porteuse}-${societeBeneficiaire}-${vIdx}`}
                                className="border-t border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => handleVehiculeClick(v.vehicule, v.porteuse, v.societeBeneficiaire)}
                              >
                                <td className="px-4 py-3 text-sm text-gray-900">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">{v.vehicule}</span>
                                    {estGenerique && (
                                      <span 
                                        className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-medium"
                                        title="Véhicule générique représentant plusieurs véhicules personnels"
                                      >
                                        ⚠️ Générique
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {v.porteuse}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {v.societeBeneficiaire}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                  {joursUtilises.toFixed(1)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                  {joursMad.toFixed(1)}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 text-center">
                                  <span className="inline-flex items-center gap-2">
                                    <span className="font-medium">
                                      {pct.toFixed(1)}%
                                    </span>
                                    {pctSuperieur100 && estGenerique && (
                                      <span 
                                        className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded"
                                        title="Pourcentage > 100% normal pour un véhicule générique"
                                      >
                                        ⚠️
                                      </span>
                                    )}
                                    <span className="text-lg">{indicateur}</span>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
      </div>
    )
  }

  const renderStatsChauffeurs = () => {
    if (!results || !results.chauffeurs || results.chauffeurs.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          Aucune mise à disposition de chauffeur trouvée pour cette période
        </div>
      )
    }

    // Appliquer les filtres
    const chauffeursFiltres = appliquerFiltres(results.chauffeurs || [], 'chauffeur')

    // ═══════════════════════════════════════════════════════════
    // DEBUG STRUCTURE DONNÉES MAD
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════')
    console.log('🔍 DEBUG STRUCTURE DONNÉES MAD')
    console.log('═══════════════════════════════════════════════════════')
    console.log('Nombre total de chauffeurs dans results:', results.chauffeurs?.length)
    console.log('Nombre de chauffeurs après filtres:', chauffeursFiltres?.length)
    console.log('Nombre de statsChauffeurs:', Object.keys(results.statsChauffeurs || {}).length)

    if (chauffeursFiltres && chauffeursFiltres.length > 0) {
      console.log('\n📋 STRUCTURE PREMIER CHAUFFEUR (chauffeurs filtrés):')
      console.log(JSON.stringify(chauffeursFiltres[0], null, 2))
    }

    // Reconstruire statsChauffeurs avec les données filtrées
    const statsChauffeursFiltres = {}
    chauffeursFiltres.forEach(chauffeur => {
      const employeur = chauffeur.employeur || 'N/A'
      if (!statsChauffeursFiltres[employeur]) {
        statsChauffeursFiltres[employeur] = []
      }
      statsChauffeursFiltres[employeur].push(chauffeur)
    })

    console.log('\n🔑 CLÉS statsChauffeurs (filtrés):')
    Object.keys(statsChauffeursFiltres || {}).forEach(key => {
      const nb = statsChauffeursFiltres[key].length
      console.log(`  "${key}": ${nb} chauffeurs`)
    })

    console.log('═══════════════════════════════════════════════════════')

    // 1. Extraire employeur des clés composées "employeur::bénéficiaire"
    const statsParEmployeurUnique = {}
    
    Object.entries(statsChauffeursFiltres || {}).forEach(([key, chauffeurs]) => {
      const employeur = key.includes('::') ? key.split('::')[0].trim() : key
      console.log(`[Regroupement] Clé: "${key}" → Employeur extrait: "${employeur}"`)
      
      if (!statsParEmployeurUnique[employeur]) {
        statsParEmployeurUnique[employeur] = []
      }
      
      statsParEmployeurUnique[employeur].push(...chauffeurs)
    })

    console.log('Employeurs uniques (statsChauffeurs):', Object.keys(statsParEmployeurUnique))
    Object.entries(statsParEmployeurUnique).forEach(([emp, chauf]) => {
      console.log(`  ${emp}: ${chauf.length} chauffeurs`)
    })

    // 2. Calculer les stats pour les cartes
    const statsCartes = Object.entries(statsParEmployeurUnique).map(([employeur, chauffeurs]) => {
      // ═══════════════════════════════════════════════════════════
      // FILTRER : Garder uniquement les chauffeurs qui PARTENT en MAD
      // ═══════════════════════════════════════════════════════════
      const chauffeursPartantEnMad = chauffeurs.filter(c => {
        // Un chauffeur part en MAD si employeur ≠ société bénéficiaire
        const partEnMad = c.employeur !== c.societeBeneficiaire;

        // ET si jours MAD > 0 (sécurité supplémentaire)
        const aDesJoursMad = (c.joursMAD || c.joursEquivalents || 0) > 0;

        // ET pas N/A
        const estValide = c.employeur !== 'N/A' && c.societeBeneficiaire !== 'N/A';

        return partEnMad && aDesJoursMad && estValide;
      });

      console.log(`[Stats] ${employeur}: ${chauffeurs.length} lignes totales → ${chauffeursPartantEnMad.length} vraies MAD`)
      
      // Compter les chauffeurs UNIQUES qui partent en MAD
      const chauffeursUniques = [...new Set(chauffeursPartantEnMad.map(c => c.chauffeur))]
      const nombreChauffeurs = chauffeursUniques.length
      
      const totalEmployes = results.totaux?.employes?.[employeur] || 0
      
      const tauxGlobal = totalEmployes > 0 
        ? (nombreChauffeurs / totalEmployes) * 100 
        : 0
      
      console.log(`[Stats] ${employeur}: ${nombreChauffeurs} chauffeurs uniques / ${totalEmployes} employés = ${tauxGlobal.toFixed(1)}%`)
      
      const joursTotauxMad = chauffeursPartantEnMad.reduce((sum, c) => 
        sum + (c.joursEquivalents || 0), 0
      )
      
      return {
        employeur,
        nombreChauffeurs,
        totalEmployes,
        tauxGlobal,
        joursTotauxMad
      }
    }).sort((a, b) => b.nombreChauffeurs - a.nombreChauffeurs)

    return (
      <div>
        {/* CARTES KPI */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {statsCartes.map(stat => (
            <div 
              key={stat.employeur}
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">💼</span>
                <h3 className="text-xs font-semibold text-gray-600 uppercase">
                  {stat.employeur}
                </h3>
              </div>
              
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {stat.nombreChauffeurs} chauffeur{stat.nombreChauffeurs !== 1 ? 's' : ''}
              </div>
              
              <div className="text-sm text-gray-600 mb-3">
                en mise à disposition
              </div>
              
              {stat.totalEmployes > 0 ? (
                <>
                  <div className="text-sm text-gray-600 mb-3">
                    Sur {stat.totalEmployes} employés
                  </div>
                  
                  <div className="text-xl font-bold text-blue-600 mb-4">
                    = {stat.tauxGlobal.toFixed(1)}% de la masse salariale
                  </div>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-300 ${getCouleurJauge(stat.tauxGlobal)}`}
                      style={{ width: `${Math.min(stat.tauxGlobal, 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm text-red-500 font-medium">
                  ⚠️ Total employés non disponible
                  <div className="text-xs text-gray-500 mt-1">
                    Vérifier les logs backend
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* TABLEAUX PAR EMPLOYEUR ET BÉNÉFICIAIRE */}
        {(() => {
          // ═══════════════════════════════════════════════════════════
          // GROUPER PAR EMPLOYEUR + BÉNÉFICIAIRE
          // ═══════════════════════════════════════════════════════════
          const groupesParEmployeurBeneficiaire = {};
          
          Object.entries(statsParEmployeurUnique).forEach(([employeur, allChauffeurs]) => {
            // Filtrer les vraies MAD
            const chauffeursMad = allChauffeurs.filter(c =>
              c.employeur !== c.societeBeneficiaire &&
              c.employeur !== 'N/A' &&
              c.societeBeneficiaire !== 'N/A' &&
              (c.joursMAD || c.joursEquivalents || 0) > 0
            );
            
            // Grouper par bénéficiaire
            chauffeursMad.forEach(c => {
              const cle = `${employeur}|${c.societeBeneficiaire}`;
              if (!groupesParEmployeurBeneficiaire[cle]) {
                groupesParEmployeurBeneficiaire[cle] = {
                  employeur,
                  societeBeneficiaire: c.societeBeneficiaire,
                  chauffeurs: []
                };
              }
              groupesParEmployeurBeneficiaire[cle].chauffeurs.push(c);
            });
          });
          
          return Object.values(groupesParEmployeurBeneficiaire)
            .sort((a, b) => {
              // Trier par nombre de chauffeurs décroissant
              const uniquesA = [...new Set(a.chauffeurs.map(c => c.chauffeur))].length;
              const uniquesB = [...new Set(b.chauffeurs.map(c => c.chauffeur))].length;
              return uniquesB - uniquesA;
            })
            .map((groupe, idx) => {
              const { employeur, societeBeneficiaire, chauffeurs } = groupe;
              
              const chauffeursUniques = [...new Set(chauffeurs.map(c => c.chauffeur))];
              const nombreChauffeurs = chauffeursUniques.length;
              const totalEmployes = results.totaux?.employes?.[employeur] || 0;
              const tauxGlobal = totalEmployes > 0 
                ? (nombreChauffeurs / totalEmployes) * 100 
                : 0;
              
              const joursTotauxMad = chauffeurs.reduce((s, c) => 
                s + (c.joursEquivalents || c.joursMAD || 0), 0
              );

              return (
                <div key={`${employeur}-${societeBeneficiaire}-${idx}`} className="mb-12">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-lg mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      💼 {employeur} de {societeBeneficiaire}: {nombreChauffeurs} chauffeur{nombreChauffeurs !== 1 ? 's' : ''}
                    </h3>
                    <ul className="text-sm text-gray-700 space-y-1">
                      <li>• {nombreChauffeurs} chauffeur(s) concerné(s)</li>
                      <li>• Jours totaux MAD : {joursTotauxMad.toFixed(1)} jours</li>
                      <li>
                        • Taux global : {tauxGlobal.toFixed(1)}% de la masse salariale 
                        ({nombreChauffeurs}/{totalEmployes} employés)
                      </li>
                    </ul>
                  </div>

                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                          Chauffeur
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                          Société employeur
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                          Société bénéficiaire
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                          Jours trav.
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">
                          Jours MAD
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                          % MAD
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {chauffeurs
                        .sort((a, b) => (b.pourcentageMAD || b.pourcentage || 0) - (a.pourcentageMAD || a.pourcentage || 0))
                        .map((c, idx) => {
                          const joursMad = c.joursMAD || c.joursEquivalents || 0;
                          const joursTrav = c.joursTotal || joursMad || 0;
                          const pct = c.pourcentageMAD || c.pourcentage || 0;
                          const indicateur = getIndicateurCouleur(pct);

                          return (
                            <tr
                              key={`${employeur}-${societeBeneficiaire}-${idx}`}
                              className="border-t border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
                              onClick={() => handleChauffeurClick(c.chauffeur, c.employeur, c.societeBeneficiaire)}
                            >
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {c.chauffeur}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {c.employeur}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {c.societeBeneficiaire}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                {joursTrav.toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                                {joursMad.toFixed(1)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900 text-center">
                                <span className="inline-flex items-center gap-2">
                                  <span className="font-medium">
                                    {pct.toFixed(1)}%
                                  </span>
                                  <span className="text-lg">{indicateur}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          });
        })()}
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Mises à disposition</h1>

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date début
            </label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date fin
            </label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Société prêteuse
            </label>
            <select
              value={societePreteur}
              onChange={(e) => setSocietePreteur(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Toutes</option>
              <option value="D & J transport">D & J transport</option>
              <option value="TPS TSMC EXPRESS">TPS TSMC EXPRESS</option>
              <option value="TSM COL">TSM COL</option>
              <option value="TSM EXP">TSM EXP</option>
              <option value="TSM LOG">TSM LOG</option>
              <option value="TSM COL AMZ">TSM COL AMZ</option>
              <option value="TSM FRET">TSM FRET</option>
              <option value="TSM HOLDING">TSM HOLDING</option>
              <option value="TSM LOC">TSM LOC</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Société emprunteuse
            </label>
            <select
              value={societeEmprunteur}
              onChange={(e) => setSocieteEmprunteur(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Toutes</option>
              <option value="D & J transport">D & J transport</option>
              <option value="TPS TSMC EXPRESS">TPS TSMC EXPRESS</option>
              <option value="TSM COL">TSM COL</option>
            </select>
          </div>
        </div>

        <div className="flex gap-4 mt-4">
          <button
            onClick={handleAnalyser}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Analyse en cours...' : 'Lancer l\'analyse'}
          </button>

          <button
            onClick={handleExportExcel}
            disabled={!results || loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* FILTRES AVANCÉS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {results && (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span>🔍</span>
              Filtres avancés
            </h3>
            <button
              onClick={() => setFiltres({
                chauffeur: '',
                vehicule: '',
                chargeur: '',
                societePreteuse: '',
                societeEmprunteuse: ''
              })}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>✕</span>
              Réinitialiser
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Filtre Chauffeur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                👤 Chauffeur
              </label>
              <select
                value={filtres.chauffeur}
                onChange={(e) => setFiltres({...filtres, chauffeur: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tous les chauffeurs</option>
                {[...new Set(results.chauffeurs?.map(c => c.chauffeur) || [])].sort().map(nom => (
                  <option key={nom} value={nom}>{nom}</option>
                ))}
              </select>
            </div>

            {/* Filtre Véhicule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🚛 Véhicule
              </label>
              <select
                value={filtres.vehicule}
                onChange={(e) => setFiltres({...filtres, vehicule: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tous les véhicules</option>
                {[...new Set(results.vehicules?.map(v => v.vehicule) || [])].sort().map(nom => (
                  <option key={nom} value={nom}>{nom}</option>
                ))}
              </select>
            </div>

            {/* Filtre Société Prêteuse */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🏢 Société Prêteuse
              </label>
              <select
                value={filtres.societePreteuse}
                onChange={(e) => setFiltres({...filtres, societePreteuse: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les sociétés</option>
                {[...new Set([
                  ...(results.chauffeurs?.map(c => c.employeur) || []),
                  ...(results.vehicules?.map(v => v.porteuse) || [])
                ])].filter(s => s && s !== 'N/A').sort().map(nom => (
                  <option key={`pret-${nom}`} value={nom}>🔵 {nom}</option>
                ))}
              </select>
            </div>

            {/* Filtre Société Emprunteuse */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🏢 Société Emprunteuse
              </label>
              <select
                value={filtres.societeEmprunteuse}
                onChange={(e) => setFiltres({...filtres, societeEmprunteuse: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Toutes les sociétés</option>
                {[...new Set([
                  ...(results.chauffeurs?.map(c => c.societeBeneficiaire) || []),
                  ...(results.vehicules?.map(v => v.societeBeneficiaire) || [])
                ])].filter(s => s && s !== 'N/A').sort().map(nom => (
                  <option key={`emp-${nom}`} value={nom}>🟢 {nom}</option>
                ))}
              </select>
            </div>

            {/* Filtre Chargeur (optionnel, à implémenter si nécessaire) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                📦 Chargeur
              </label>
              <select
                value={filtres.chargeur}
                onChange={(e) => setFiltres({...filtres, chargeur: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                disabled
              >
                <option value="">À venir</option>
              </select>
            </div>
          </div>
          
          {/* Indicateur filtres actifs */}
          {Object.values(filtres).some(f => f !== '') && (
            <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
              <span>🔍</span>
              Filtres actifs : {Object.values(filtres).filter(f => f !== '').length}
            </div>
          )}
        </div>
      )}

      {/* Onglets */}
      {results && (
        <div className="bg-white border-b border-gray-200 mb-6">
          <div className="flex gap-4">
            {['KPI', 'Stats Chauffeurs', 'Stats Véhicules'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contenu des onglets */}
      {results && activeTab === 'Stats Chauffeurs' && renderStatsChauffeurs()}
      {results && activeTab === 'KPI' && renderKPI()}
      {results && activeTab === 'Stats Véhicules' && renderStatsVehicules()}

      {/* Modal détails chauffeur */}
      {modalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 flex items-center justify-between text-white ${
              modalData?.type === 'vehicule' ? 'bg-green-600' : 'bg-blue-600'
            }`}>
              <h2 className="text-xl font-bold">
                {modalLoading ? 'Chargement...' : (
                  modalData?.type === 'vehicule' 
                    ? `Détail : ${modalData?.vehicule || 'Véhicule'}`
                    : `Détail : ${modalData?.chauffeur || 'Chauffeur'}`
                )}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-white hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalLoading ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-4 text-gray-600">Chargement des détails...</p>
                </div>
              ) : modalData ? (
                <>
                  {/* Résumé */}
                  <div className={`border-l-4 p-4 rounded-lg mb-6 ${
                    modalData?.type === 'vehicule' 
                      ? 'bg-green-50 border-green-500' 
                      : 'bg-blue-50 border-blue-500'
                  }`}>
                    <div className="text-sm text-gray-700">
                      {modalData?.type === 'vehicule' ? (
                        <>
                          <div className="font-semibold mb-1">{modalData.porteuse || 'N/A'} → {modalData.societeBeneficiaire || 'N/A'}</div>
                          <div>{modalData.ods?.length || 0} ODS trouvés pour la période</div>
                        </>
                      ) : (
                        <>
                          <div className="font-semibold mb-1">{modalData.employeur || 'N/A'} → {modalData.societeBeneficiaire || 'N/A'}</div>
                          <div>{modalData.ods?.length || 0} ODS trouvés pour la période</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Liste des ODS */}
                  {modalData.ods && modalData.ods.length > 0 ? (
                    <div className="space-y-4">
                      {modalData.ods.map((ods, idx) => {
                        // ═══════════════════════════════════════════════════════════
                        // DÉTERMINER LA COULEUR DE L'ODS
                        // VERT si toutes les courses sont pour la porteuse/employeur
                        // ORANGE si au moins une course est en MAD
                        // ═══════════════════════════════════════════════════════════
                        const referenceSociete = modalData?.type === 'vehicule' 
                          ? (modalData.porteuse || 'N/A')
                          : (modalData.employeur || 'N/A');
                        const coursesAvecMAD = ods.courses && ods.courses.length > 0
                          ? ods.courses.filter(c => 
                              c.societeBeneficiaire && 
                              c.societeBeneficiaire !== 'N/A' && 
                              c.societeBeneficiaire !== referenceSociete
                            )
                          : [];
                        const odsAvecMAD = coursesAvecMAD.length > 0;
                        const couleurODS = odsAvecMAD ? 'bg-orange-100 border-orange-300' : 'bg-green-100 border-green-300';

                        return (
                          <div 
                            key={ods.id || idx} 
                            className={`border-2 rounded-lg p-4 hover:shadow-md transition-shadow ${couleurODS}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">📅</span>
                                <div>
                                  <div className="font-semibold text-gray-900">
                                    {formatDate(ods.date)} - {ods.name}
                                  </div>
                                  {modalData?.type === 'vehicule' ? (
                                    <>
                                      {ods.chauffeur && (
                                        <div className="text-sm text-gray-600 mt-1">
                                          👤 Chauffeur : {ods.chauffeur}
                                        </div>
                                      )}
                                      {ods.courses && ods.courses.length > 0 && (
                                        <div className="text-sm text-gray-600">
                                          🏢 Bénéficiaires : {[...new Set(ods.courses.map(c => c.societeBeneficiaire))].join(', ')}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <div className="text-sm text-gray-600 mt-1">
                                        🚛 Véhicule : {ods.vehicule} ({ods.porteuse})
                                      </div>
                                      {ods.courses && ods.courses.length > 0 && (
                                        <div className="text-sm text-gray-600">
                                          🏢 Bénéficiaires : {[...new Set(ods.courses.map(c => c.societeBeneficiaire))].join(', ')}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  {odsAvecMAD && (
                                    <div className="text-xs text-orange-700 font-medium mt-1">
                                      ⚠️ Mise à disposition détectée
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Courses */}
                            {ods.courses && ods.courses.length > 0 ? (
                              <div className="mt-3 pl-6 border-l-2 border-gray-300">
                                <div className="text-sm font-semibold text-gray-700 mb-3">
                                  Courses ({ods.courses.length}) :
                                </div>
                                <div className="space-y-3">
                                  {ods.courses.map((course, courseIdx) => {
                                    // ═══════════════════════════════════════════════════════════
                                    // DÉTERMINER LA COULEUR DE LA COURSE
                                    // VERT si société bénéficiaire === porteuse/employeur
                                    // ORANGE si société bénéficiaire !== porteuse/employeur (MAD)
                                    // ═══════════════════════════════════════════════════════════
                                    const estMAD = course.societeBeneficiaire && 
                                      course.societeBeneficiaire !== 'N/A' && 
                                      course.societeBeneficiaire !== referenceSociete;
                                    const couleurCourse = estMAD ? 'bg-orange-100 border-orange-300' : 'bg-green-100 border-green-300';

                                    return (
                                      <div 
                                        key={course.id || courseIdx} 
                                        className={`rounded-lg p-3 border-2 ${couleurCourse}`}
                                      >
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="font-mono font-semibold text-gray-900">{course.name}</span>
                                          {estMAD && (
                                            <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-medium">
                                              MAD
                                            </span>
                                          )}
                                        </div>
                                        <div className="space-y-1.5 text-sm text-gray-700">
                                          <div className="flex items-center gap-2">
                                            <span>📦</span>
                                            <span className="text-gray-600">Chargeur :</span>
                                            <span className="font-medium">{course.chargeur || 'N/A'}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span>🚛</span>
                                            <span className="text-gray-600">Tournée :</span>
                                            <span className="font-medium">{course.tournee || 'N/A'}</span>
                                            {course.societeBeneficiaire && course.societeBeneficiaire !== 'N/A' && (
                                              <span className={`font-medium ${estMAD ? 'text-orange-700' : 'text-green-700'}`}>
                                                ({course.societeBeneficiaire})
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span>📊</span>
                                            <span className="text-gray-600">Colis :</span>
                                            <span className="font-semibold text-blue-600">{course.nbColis || 0}</span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 pl-6 text-sm text-gray-500 italic">
                                Aucune course pour cet ODS
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      {modalData?.type === 'vehicule' 
                        ? 'Aucun ODS trouvé pour ce véhicule sur cette période'
                        : 'Aucun ODS trouvé pour ce chauffeur sur cette période'
                      }
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Erreur lors du chargement des détails
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => setModalOpen(false)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


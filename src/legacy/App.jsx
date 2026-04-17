import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Mad from './pages/daf/Mad'
import Assurances from './pages/flotte/Assurances'
import { WebfleetDashboard } from './features/webfleet'
import Salesforce from './pages/parametres/Salesforce'
import Employes from './pages/rh/Employes'
import Dashboard from './pages/rh/Dashboard'
import DashboardGraphique from './pages/rh/DashboardGraphique'
import EmployeDetail from './pages/rh/EmployeDetail'
import Absences from './pages/rh/Absences'
import SoldesCP from './pages/rh/SoldesCP'
import Documents from './pages/rh/Documents'
import Acomptes from './pages/rh/Acomptes'
import Notifications from './pages/rh/Notifications'
import OrganigrammeRH from './pages/rh/OrganigrammeRH'
import AcomptesManager from './pages/manager/AcomptesManager'
import AcomptesComptable from './pages/comptable/AcomptesComptable'
import AcomptesRH from './pages/rh/AcomptesRH'
import DashboardParc from './pages/parc/DashboardParc'
import OrdresReparation from './pages/parc/OrdresReparation'
import GestionStock from './pages/parc/GestionStock'
import FormulaireOR from './pages/parc/FormulaireOR'
import PlanningGarage from './pages/parc/PlanningGarage'
import GestionFournisseurs from './pages/parc/GestionFournisseurs'
import GestionUtilisateurs from './pages/admin/GestionUtilisateurs'
import Permissions from './pages/admin/Permissions'
import Connexions from './pages/admin/Connexions'
import ReferentielPage from './pages/admin/ReferentielPage'
import DashboardExploitation from './pages/exploitation/DashboardExploitation'
import PlanningChargeur from './pages/exploitation/PlanningChargeur'
import SuiviColis from './pages/exploitation/SuiviColis'
import CarburantExploitation from './pages/exploitation/CarburantExploitation'
import ControleurGestion from './pages/gestion/ControleurGestion'
import DashboardDirection from './pages/direction/DashboardDirection'
import DashboardGroupe from './pages/direction/DashboardGroupe'
import Prefacturation from './pages/direction/Prefacturation'
import PrefacturationClient from './pages/direction/PrefacturationClient'
import AnalyseFinanciereDirection from './pages/direction/AnalyseFinanciereDirection'
import Rentabilite from './pages/direction/Rentabilite'
import MasseSalarialePage from './pages/finance/MasseSalarialePage'
import TICPE from './pages/direction/TICPE'
import FECPage from './pages/direction/FEC'
import SuiviSAV from './pages/sav/SuiviSAV'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/rh/dashboard" replace />} />
            <Route path="daf/mad" element={
              <ProtectedRoute allowedRoles={['RH', 'ADMIN', 'DIRECTION', 'MANAGER']} allowedModules={['mad']}>
                <Mad />
              </ProtectedRoute>
            } />
            <Route path="daf/mises-a-disposition" element={
              <ProtectedRoute allowedRoles={['RH', 'ADMIN', 'DIRECTION', 'MANAGER']} allowedModules={['mad']}>
                <Mad />
              </ProtectedRoute>
            } />
            <Route path="flotte/assurances" element={
              <ProtectedRoute
                allowedRoles={['RH', 'MANAGER', 'ADMIN', 'GESTIONNAIRE_PARC', 'EXPLOITATION', 'DIRECTION']}
                allowedModules={['recherche-vehicules']}
              >
                <Assurances />
              </ProtectedRoute>
            } />
            <Route path="flotte/webfleet" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER', 'ADMIN']} allowedModules={['webfleet']}>
                <WebfleetDashboard />
              </ProtectedRoute>
            } />
            <Route path="rh/dashboard" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER']} allowedModules={['dashboard-rh']}>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="rh/organigramme" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER']} allowedModules={['organigramme']}>
                <OrganigrammeRH />
              </ProtectedRoute>
            } />
            <Route path="rh/dashboard-graphique" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER']} allowedModules={['graphiques-rh']}>
                <DashboardGraphique />
              </ProtectedRoute>
            } />
            <Route path="rh/employes" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER']} allowedModules={['employes']}>
                <Employes />
              </ProtectedRoute>
            } />
            <Route path="rh/employes/:id" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER']} allowedModules={['employes']}>
                <EmployeDetail />
              </ProtectedRoute>
            } />
            <Route path="rh/absences" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER', 'EMPLOYE']} allowedModules={['absences']}>
                <Absences />
              </ProtectedRoute>
            } />
            <Route path="rh/soldes-cp" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER', 'EMPLOYE']} allowedModules={['soldes-cp']}>
                <SoldesCP />
              </ProtectedRoute>
            } />
            <Route path="rh/documents" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER', 'EMPLOYE']} allowedModules={['documents']}>
                <Documents />
              </ProtectedRoute>
            } />
            <Route path="rh/acomptes" element={
              <ProtectedRoute allowedRoles={['RH', 'MANAGER', 'EMPLOYE']} allowedModules={['acomptes']}>
                <Acomptes />
              </ProtectedRoute>
            } />
            <Route path="rh/notifications" element={<Notifications />} />
            <Route path="rh/acomptes-rh" element={
              <ProtectedRoute allowedRoles={['RH']} allowedModules={['acomptes']}>
                <AcomptesRH />
              </ProtectedRoute>
            } />
            <Route path="manager/acomptes" element={
              <ProtectedRoute allowedRoles={['MANAGER']} allowedModules={['acomptes']}>
                <AcomptesManager />
              </ProtectedRoute>
            } />
            <Route path="comptable/acomptes" element={
              <ProtectedRoute allowedRoles={['COMPTABLE']} allowedModules={['acomptes']}>
                <AcomptesComptable />
              </ProtectedRoute>
            } />
            <Route path="parc/dashboard" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['dashboard-parc']}>
                <DashboardParc />
              </ProtectedRoute>
            } />
            <Route path="parc/ordres-reparation" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['ordres-reparation']}>
                <OrdresReparation />
              </ProtectedRoute>
            } />
            <Route path="parc/ordres-reparation/nouveau" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['ordres-reparation']}>
                <FormulaireOR />
              </ProtectedRoute>
            } />
            <Route path="parc/ordres-reparation/modifier/:id" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['ordres-reparation']}>
                <FormulaireOR />
              </ProtectedRoute>
            } />
            <Route path="parc/stock" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['stock']}>
                <GestionStock />
              </ProtectedRoute>
            } />
            <Route path="parc/planning" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['planning-garage']}>
                <PlanningGarage />
              </ProtectedRoute>
            } />
            <Route path="parc/fournisseurs" element={
              <ProtectedRoute allowedRoles={['GESTIONNAIRE_PARC', 'ADMIN']} allowedModules={['fournisseurs']}>
                <GestionFournisseurs />
              </ProtectedRoute>
            } />
            <Route path="exploitation/dashboard" element={
              <ProtectedRoute allowedRoles={['EXPLOITATION', 'ADMIN']} allowedModules={['dashboard-exploitation']}>
                <DashboardExploitation />
              </ProtectedRoute>
            } />
            <Route path="exploitation/planning-chargeur" element={
              <ProtectedRoute allowedRoles={['EXPLOITATION', 'ADMIN']} allowedModules={['planning-chargeur']}>
                <PlanningChargeur />
              </ProtectedRoute>
            } />
            <Route path="exploitation/suivi-colis" element={
              <ProtectedRoute allowedRoles={['EXPLOITATION', 'ADMIN']} allowedModules={['suivi-colis']}>
                <SuiviColis />
              </ProtectedRoute>
            } />
            <Route path="exploitation/carburant" element={
              <ProtectedRoute allowedRoles={['EXPLOITATION', 'ADMIN']} allowedModules={['carburant']}>
                <CarburantExploitation />
              </ProtectedRoute>
            } />
            <Route path="gestion/controleur" element={
              <ProtectedRoute allowedRoles={['MANAGER', 'EXPLOITATION', 'ADMIN']} allowedModules={['cdg']}>
                <ControleurGestion />
              </ProtectedRoute>
            } />
            <Route path="direction/dashboard" element={
              <ProtectedRoute
                allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION']}
                allowedModules={['suivi-global']}
              >
                <DashboardGroupe />
              </ProtectedRoute>
            } />
            <Route path="direction/suivi-operationnel" element={
              <ProtectedRoute
                allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION']}
                allowedModules={['suivi-global']}
              >
                <DashboardDirection />
              </ProtectedRoute>
            } />
            <Route path="direction/prefacturation-prestataires" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['prefact-prestataires']}>
                <Prefacturation />
              </ProtectedRoute>
            } />
            <Route path="direction/prefacturation-clients" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['prefact-clients']}>
                <PrefacturationClient />
              </ProtectedRoute>
            } />
            <Route path="direction/analyse-financiere" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['analyse-financiere']}>
                <AnalyseFinanciereDirection />
              </ProtectedRoute>
            } />
            <Route path="direction/rentabilite" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['rentabilite']}>
                <Rentabilite />
              </ProtectedRoute>
            } />
            <Route path="finance/masse-salariale" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['rentabilite']}>
                <MasseSalarialePage />
              </ProtectedRoute>
            } />
            <Route path="direction/ticpe" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['ticpe']}>
                <TICPE />
              </ProtectedRoute>
            } />
            <Route path="direction/fec" element={
              <ProtectedRoute allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER']} allowedModules={['fec']}>
                <FECPage />
              </ProtectedRoute>
            } />
            <Route path="sav/suivi-stats" element={
              <ProtectedRoute
                allowedRoles={['DIRECTION', 'ADMIN', 'RH', 'MANAGER', 'EXPLOITATION']}
                allowedModules={['sav']}
              >
                <SuiviSAV />
              </ProtectedRoute>
            } />
            <Route path="admin/utilisateurs" element={
              <ProtectedRoute allowedRoles={['ADMIN']} allowedModules={['utilisateurs']}>
                <GestionUtilisateurs />
              </ProtectedRoute>
            } />
            <Route path="admin/permissions" element={
              <ProtectedRoute allowedRoles={['ADMIN']} allowedModules={['permissions']}>
                <Permissions />
              </ProtectedRoute>
            } />
            <Route path="admin/connexions" element={
              <ProtectedRoute allowedRoles={['ADMIN']} allowedModules={['connexions']}>
                <Connexions />
              </ProtectedRoute>
            } />
            <Route path="admin/referentiel" element={
              <ProtectedRoute allowedRoles={['ADMIN']} allowedModules={['connexions']}>
                <ReferentielPage />
              </ProtectedRoute>
            } />
            <Route path="parametres/salesforce" element={
              <ProtectedRoute allowedRoles={['ADMIN']} allowedModules={['salesforce']}>
                <Salesforce />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

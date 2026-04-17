import { useState } from 'react'
import { PageHeader } from '../../design'
import { Building2, Truck, Users, BookOpen, Database } from 'lucide-react'
import SocietesTab from './referentiel/SocietesTab'
import ParametresTab from './referentiel/ParametresTab'

const TABS = [
  {
    key: 'societes',
    label: 'Sociétés & Prestataires',
    icon: Building2,
    description: 'Groupe G2L et partenaires externes',
  },
  {
    key: 'parametres',
    label: 'Paramètres comptables',
    icon: BookOpen,
    description: 'Mapping comptes FEC par catégorie',
  },
  {
    key: 'vehicules',
    label: 'Véhicules & Contrats',
    icon: Truck,
    description: 'Flotte, LOA/LLD, assurances',
    soon: true,
  },
  {
    key: 'personnes',
    label: 'Personnes & Contrats',
    icon: Users,
    description: 'Salariés et historique emploi',
    soon: true,
  },
]

export default function ReferentielPage() {
  const [activeTab, setActiveTab] = useState('societes')

  return (
    <div className="p-6 max-w-full space-y-5" style={{ background: 'var(--color-bg)' }}>
      <PageHeader
        title="Référentiel G2L"
        subtitle="Paramétrage central — sociétés, véhicules, personnes, comptabilité"
        icon={Database}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon, description, soon }) => (
          <button
            key={key}
            type="button"
            onClick={() => !soon && setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] border transition-all text-left ${
              soon
                ? 'opacity-40 cursor-not-allowed border-[var(--color-border)] bg-[var(--color-bg)]'
                : activeTab === key
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-[var(--shadow-sm)]'
                  : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
            }`}
          >
            <Icon size={15} />
            <div>
              <p
                className={`text-[12px] font-medium ${
                  activeTab === key ? 'text-white' : 'text-[var(--color-ink)]'
                }`}
              >
                {label}
                {soon && (
                  <span className="ml-2 text-[9px] font-mono uppercase bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-1.5 py-0.5 rounded">
                    Bientôt
                  </span>
                )}
              </p>
              <p
                className={`text-[10px] font-mono ${
                  activeTab === key ? 'text-white/70' : 'text-[var(--color-muted)]'
                }`}
              >
                {description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'societes' && <SocietesTab />}
        {activeTab === 'parametres' && <ParametresTab />}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Login = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    console.log('[LOGIN] Tentative de connexion avec:', email)
    const result = await login(email, password)
    console.log('[LOGIN] Résultat:', result)

    if (result.success) {
      console.log('[LOGIN] Connexion réussie, redirection...')
      navigate('/rh/dashboard', { replace: true })
    } else {
      console.error('[LOGIN] Erreur:', result.error)
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">

      {/* ── PANNEAU GAUCHE — Branding ── */}
      <div
        className="hidden lg:flex lg:w-[42%] flex-col justify-between p-10"
        style={{ background: '#0f1729' }}
      >

        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#2563EB] text-[11px] font-bold text-white tracking-wide">
            G2L
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white leading-tight">G2L CRM PRO</p>
            <p className="text-[11px] text-white/40 leading-tight">Groupe G2L · Perpignan</p>
          </div>
        </div>

        <div>
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 mb-6">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-white/50 font-mono tracking-wider uppercase">Système en ligne</span>
            </div>
            <h1 className="text-[32px] font-semibold text-white leading-tight tracking-tight mb-3">
              Pilotez votre groupe<br />
              <span className="text-white/40">en temps réel.</span>
            </h1>
            <p className="text-[13px] text-white/35 leading-relaxed max-w-[320px]">
              Transport · Logistique · Finance · RH<br />
              D&J Transport · TPS TSMC Express · Holding G2L
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { val: '90', label: 'Véhicules' },
              { val: '110', label: 'Collaborateurs' },
              { val: '3', label: 'Entités' },
            ].map(({ val, label }) => (
              <div key={label} className="rounded-[8px] border border-white/[0.08] bg-white/[0.04] p-3">
                <p className="text-[22px] font-semibold text-white leading-none mb-1">{val}</p>
                <p className="text-[10px] text-white/35 uppercase tracking-wider font-mono">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-white/20 font-mono uppercase tracking-wider">
            G2L CRM PRO · 2026
          </p>
          <p className="text-[10px] text-white/20 font-mono">
            v1.0
          </p>
        </div>
      </div>

      {/* ── PANNEAU DROIT — Formulaire ── */}
      <div className="flex flex-1 items-center justify-center bg-[var(--color-bg)] px-6 py-12">
        <div className="w-full max-w-[360px]">

          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#2563EB] text-[10px] font-bold text-white">
              G2L
            </div>
            <p className="text-[14px] font-semibold text-[var(--color-ink)]">G2L CRM PRO</p>
          </div>

          <div className="mb-8">
            <h2 className="text-[22px] font-semibold text-[var(--color-ink)] tracking-tight mb-1">
              Connexion
            </h2>
            <p className="text-[13px] text-[var(--color-muted)]">
              Accédez à votre espace de pilotage
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)] font-mono mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@groupeg2l.fr"
                required
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)] font-mono mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-placeholder)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2.5 text-[12.5px] text-[var(--color-danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>

          </form>

          <p className="mt-8 text-center text-[11px] text-[var(--color-faint)] font-mono">
            G2L CRM PRO · USAGE INTERNE UNIQUEMENT
          </p>

        </div>
      </div>

    </div>
  )
}

export default Login

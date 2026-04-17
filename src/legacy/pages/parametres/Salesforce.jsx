import { useState } from 'react'
import API_BASE from '../../config/api';
export default function Salesforce() {
  const [environment, setEnvironment] = useState('production')
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch(`${API_BASE}/api/salesforce/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erreur de connexion')
      }

      setConnected(true)
      setMessage(`✅ Connecté à Salesforce ${environment}`)
    } catch (err) {
      setConnected(false)
      setError(err.message)
      setMessage(null)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = () => {
    setConnected(false)
    setMessage('Déconnecté de Salesforce')
    setError(null)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Connexion Salesforce</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm max-w-2xl">
        <div className="space-y-6">
          {/* Sélection environnement */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Environnement
            </label>
            <select
              value={environment}
              onChange={(e) => {
                setEnvironment(e.target.value)
                setConnected(false)
                setMessage(null)
                setError(null)
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Les identifiants sont configurés dans le fichier .env du backend
            </p>
          </div>

          {/* Statut de connexion */}
          {connected && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <div>
                  <div className="font-semibold">Connecté</div>
                  <div className="text-sm">{message}</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xl">❌</span>
                <div>
                  <div className="font-semibold">Erreur de connexion</div>
                  <div className="text-sm">{error}</div>
                </div>
              </div>
            </div>
          )}

          {message && !connected && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">
              {message}
            </div>
          )}

          {/* Boutons */}
          <div className="flex gap-4">
            <button
              onClick={handleConnect}
              disabled={loading || connected}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connexion en cours...' : 'Se connecter'}
            </button>

            {connected && (
              <button
                onClick={handleDisconnect}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Se déconnecter
              </button>
            )}
          </div>

          {/* Informations */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Informations de connexion
            </h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                <strong>Environnement sélectionné :</strong> {environment === 'production' ? 'Production' : 'Sandbox'}
              </p>
              <p>
                <strong>URL de connexion :</strong>{' '}
                {environment === 'production' 
                  ? 'https://login.salesforce.com' 
                  : 'https://test.salesforce.com'}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Les identifiants (username, password, security token) sont stockés dans le fichier .env du serveur backend.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


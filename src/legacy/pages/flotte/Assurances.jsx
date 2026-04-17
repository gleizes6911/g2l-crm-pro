import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Car, Building2, Shield, ExternalLink } from 'lucide-react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet'
import API_BASE from '../../config/api';
const USE_OSRM = true

export default function Assurances() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [vehiculeSelectionne, setVehiculeSelectionne] = useState(null)
  const [modalDetailsOuverte, setModalDetailsOuverte] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [errorDetails, setErrorDetails] = useState(null)
  const [activePanel, setActivePanel] = useState('gps')
  const [gpsData, setGpsData] = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState(null)
  const [tripDate, setTripDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [tripsData, setTripsData] = useState([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [tripsError, setTripsError] = useState(null)
  const [gpsMapMode, setGpsMapMode] = useState('standard')
  const [routedTrips, setRoutedTrips] = useState([])
  const [tripsRouting, setTripsRouting] = useState(false)
  const routedTripsRef = useRef(new Map())

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      setError(null)
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setLoading(true)
        setError(null)
        const url = `${API_BASE}/api/flotte/assurances?q=${encodeURIComponent(
          query
        )}&environment=production`
        const res = await fetch(url, { signal: controller.signal })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Erreur lors de la recherche')
        }
        setResults(data.results || [])
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error(e)
          setError(e.message)
        }
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const handleClickImmatriculation = async (immatriculation) => {
    if (!immatriculation || immatriculation === 'N/C') return;
    
    try {
      setLoadingDetails(true)
      setErrorDetails(null)
      setModalDetailsOuverte(true)
      
      // Encoder l'immatriculation pour l'URL (double encodage pour gérer les caractères spéciaux)
      const immatEncoded = encodeURIComponent(immatriculation.trim())
      const url = `${API_BASE}/api/flotte/vehicules/${immatEncoded}?environment=production`
      
      console.log('[Frontend] Récupération détails pour:', immatriculation)
      console.log('[Frontend] URL:', url)
      
      const res = await fetch(url)
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Erreur lors de la récupération des détails')
      }
      
      setVehiculeSelectionne(data)
    } catch (e) {
      console.error('Erreur récupération détails véhicule:', e)
      setErrorDetails(e.message || 'Une erreur est survenue lors du chargement des détails')
    } finally {
      setLoadingDetails(false)
    }
  }

  const formaterDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR')
    } catch {
      return dateStr
    }
  }

  const formaterDateHeure = (dateStr) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleString('fr-FR')
    } catch {
      return dateStr
    }
  }

  const formatDuration = (total) => {
    const n = Math.max(0, Number(total) || 0)
    const h = Math.floor(n / 3600)
    const m = Math.floor((n % 3600) / 60)
    return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`
  }

  const shortText = (txt) => {
    const s = String(txt || '').trim()
    if (!s) return '—'
    return s.length > 80 ? `${s.slice(0, 77)}...` : s
  }

  const gpsStatusColor = (gps) => {
    const ign = Number(gps?.ignition)
    const st = Number(gps?.standstill)
    if (ign === 1 && st === 0) return '#16a34a'
    if (ign === 1 && st === 1) return '#eab308'
    return '#6b7280'
  }

  const gpsStatusLabel = (gps) => {
    const ign = Number(gps?.ignition)
    const st = Number(gps?.standstill)
    if (ign === 1 && st === 0) return 'En route'
    if (ign === 1 && st === 1) return "À l'arrêt"
    return 'Moteur coupé'
  }

  const daySummary = useMemo(() => {
    const tripCount = tripsData.length
    const distanceKm = tripsData.reduce((s, t) => s + (Number(t.distance_m) || 0) / 1000, 0)
    const durationSec = tripsData.reduce((s, t) => s + (Number(t.duration_s) || 0), 0)
    const fuelL = tripsData.reduce((s, t) => s + (Number(t.fuel_usage) || 0), 0)
    return { tripCount, distanceKm, durationSec, fuelL }
  }, [tripsData])

  const tripSegments = useMemo(
    () =>
      (tripsData || [])
        .map((t) => {
          const sLat = Number(t?.start_lat)
          const sLng = Number(t?.start_lng)
          const eLat = Number(t?.end_lat)
          const eLng = Number(t?.end_lng)
          if ([sLat, sLng, eLat, eLng].some((v) => Number.isNaN(v))) return null
          return {
            tripid: String(t?.tripid || ''),
            start: [sLat, sLng],
            end: [eLat, eLng],
            path: [
              [sLat, sLng],
              [eLat, eLng],
            ],
          }
        })
        .filter(Boolean),
    [tripsData]
  )

  const tripKey = useMemo(
    () =>
      (tripsData || [])
        .map((t) => String(t?.tripid || ''))
        .filter(Boolean)
        .join(','),
    [tripsData]
  )

  const displayTripSegments = useMemo(() => {
    if (!USE_OSRM) return tripSegments
    return routedTrips.length > 0 ? routedTrips : tripSegments
  }, [routedTrips, tripSegments])

  useEffect(() => {
    if (!USE_OSRM) {
      setRoutedTrips([])
      setTripsRouting(false)
      return undefined
    }
    if (!tripKey) {
      setRoutedTrips([])
      setTripsRouting(false)
      return undefined
    }
    const cached = routedTripsRef.current.get(tripKey)
    if (cached) {
      setRoutedTrips(cached)
      setTripsRouting(false)
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()

    const routeTrips = async () => {
      setTripsRouting(true)
      const jobs = tripSegments.map((seg, idx) => {
        return new Promise((resolve) => {
          setTimeout(async () => {
            if (cancelled || controller.signal.aborted) {
              resolve({ ...seg, path: [seg.start, seg.end], _routed: false })
              return
            }
            const [startLat, startLng] = seg.start || []
            const [endLat, endLng] = seg.end || []
            const fallback = { ...seg, path: [seg.start, seg.end], _routed: false }
            if ([startLat, startLng, endLat, endLng].some((v) => v == null || Number.isNaN(Number(v)))) {
              resolve(fallback)
              return
            }
            const timeout = setTimeout(() => controller.abort(), 8000)
            try {
              const response = await fetch(
                `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`,
                { signal: controller.signal }
              )
              if (!response.ok) {
                resolve(fallback)
                return
              }
              const data = await response.json()
              const coords = data?.routes?.[0]?.geometry?.coordinates
              if (!Array.isArray(coords) || coords.length < 2) {
                resolve(fallback)
                return
              }
              const path = coords.map(([lng, lat]) => [Number(lat), Number(lng)])
              resolve({ ...seg, path, _routed: true })
            } catch {
              resolve(fallback)
            } finally {
              clearTimeout(timeout)
            }
          }, idx * 200)
        })
      })

      const settled = await Promise.allSettled(jobs)
      if (cancelled || controller.signal.aborted) return
      const done = settled.map((r, idx) =>
        r.status === 'fulfilled' && r.value
          ? r.value
          : { ...tripSegments[idx], path: [tripSegments[idx].start, tripSegments[idx].end], _routed: false }
      )
      routedTripsRef.current.set(tripKey, done)
      setRoutedTrips(done)
      setTripsRouting(false)
    }

    routeTrips()
    return () => {
      cancelled = true
      controller.abort()
      setTripsRouting(false)
    }
  }, [tripKey])

  useEffect(() => {
    if (!modalDetailsOuverte || !vehiculeSelectionne?.immatriculation) return
    const controller = new AbortController()
    const loadGps = async () => {
      try {
        setGpsLoading(true)
        setGpsError(null)
        const immat = encodeURIComponent(String(vehiculeSelectionne.immatriculation || '').trim())
        const res = await fetch(`${API_BASE}/api/webfleet/vehicle-by-name/${immat}`, {
          signal: controller.signal,
        })
        const response = await res.json()
        if (!res.ok) throw new Error(response.error || 'Erreur position actuelle')
        if (response?.found !== true || !response?.data) {
          setGpsData(null)
          setGpsError('Véhicule non tracké')
          return
        }
        setGpsData(response.data)
      } catch (e) {
        if (e.name !== 'AbortError') {
          setGpsData(null)
          setGpsError(e.message || 'Erreur position actuelle')
        }
      } finally {
        setGpsLoading(false)
      }
    }
    loadGps()
    return () => controller.abort()
  }, [modalDetailsOuverte, vehiculeSelectionne?.immatriculation])

  useEffect(() => {
    if (!modalDetailsOuverte || !vehiculeSelectionne?.immatriculation || !tripDate) return
    const controller = new AbortController()
    const loadTrips = async () => {
      try {
        setTripsLoading(true)
        setTripsError(null)
        const immat = encodeURIComponent(String(vehiculeSelectionne.immatriculation || '').trim())
        const qs = new URLSearchParams({ date: tripDate })
        const res = await fetch(`${API_BASE}/api/webfleet/trips-by-name/${immat}?${qs.toString()}`, {
          signal: controller.signal,
        })
        if (res.status === 404) {
          setTripsData([])
          setTripsError('Véhicule non tracké')
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur historique trajets')
        setTripsData(Array.isArray(data.data) ? data.data : [])
      } catch (e) {
        if (e.name !== 'AbortError') {
          setTripsData([])
          setTripsError(e.message || 'Erreur historique trajets')
        }
      } finally {
        setTripsLoading(false)
      }
    }
    loadTrips()
    return () => controller.abort()
  }, [modalDetailsOuverte, vehiculeSelectionne?.immatriculation, tripDate])

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Recherche véhicules</h1>
      <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
        Tape une <strong>immatriculation</strong> ou une <strong>société</strong> (porteuse / propriétaire) pour
        retrouver l'assurance et les contrats liés.
      </p>

      <div className="bg-white p-4 sm:p-6 rounded-lg shadow mb-4 sm:mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Exemples : HA-123-TSM, D & J transport, TPS TSMC EXPRESS…"
          className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {loading && <span className="text-xs sm:text-sm text-gray-500 mt-2 block">Recherche…</span>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 sm:py-3 rounded mb-4 sm:mb-6 text-sm sm:text-base">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Immatriculation</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Société porteuse</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Société propriétaire</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Agence location</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Organisme financement</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Contrat financement</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Fournisseur entretien</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">Assureur</th>
                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-700 uppercase whitespace-nowrap">N° contrat assurance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {results.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 sm:py-8 text-center text-xs sm:text-sm text-gray-500">
                    {query.length < 2
                      ? 'Saisis au moins 2 caractères pour lancer la recherche.'
                      : 'Aucun véhicule trouvé pour ce critère.'}
                  </td>
                </tr>
              )}
              {results.map((row, idx) => (
                <tr key={`${row.immatriculation || 'N/C'}-${row.numeroContrat || idx}`} className="hover:bg-gray-50">
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-900 font-medium">
                    <button
                      onClick={() => handleClickImmatriculation(row.immatriculation)}
                      className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                    >
                      {row.immatriculation || 'N/C'}
                    </button>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.societePorteuse || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.societeProprietaire || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.agenceLocation || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.organismeFinancement || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.contratFinancement || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.fournisseurEntretien || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.assureur || '—'}</td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600">{row.numeroContrat || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Détails Véhicule */}
      {modalDetailsOuverte && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sm:p-6 rounded-t-xl sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Car className="w-6 h-6 sm:w-8 sm:h-8" />
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold">
                      {loadingDetails ? 'Chargement...' : vehiculeSelectionne?.immatriculation || 'Détails véhicule'}
                    </h2>
                    <p className="text-blue-100 text-sm sm:text-base mt-1">
                      Informations complètes du véhicule
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {vehiculeSelectionne?.salesforceUrl && (
                    <a
                      href={vehiculeSelectionne.salesforceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg transition-colors text-sm sm:text-base"
                      title="Voir la fiche complète dans Salesforce"
                    >
                      <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="hidden sm:inline">Voir dans Salesforce</span>
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setModalDetailsOuverte(false)
                      setVehiculeSelectionne(null)
                      setErrorDetails(null)
                    }}
                    className="text-white hover:bg-blue-700 rounded-full p-2 transition-colors"
                    aria-label="Fermer"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* Contenu */}
            <div className="p-4 sm:p-6">
              {loadingDetails ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : errorDetails ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                  <p className="font-semibold mb-2">Erreur lors du chargement des détails</p>
                  <p className="text-sm">{errorDetails}</p>
                  <button
                    onClick={() => {
                      setErrorDetails(null)
                      setModalDetailsOuverte(false)
                    }}
                    className="mt-3 text-sm text-red-800 hover:underline"
                  >
                    Fermer
                  </button>
                </div>
              ) : vehiculeSelectionne ? (
                <div className="space-y-6">
                  {/* Informations générales */}
                  <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      Informations générales
                    </h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-4">
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Immatriculation</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">{vehiculeSelectionne.immatriculation}</p>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Constructeur</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">{vehiculeSelectionne.constructeur}</p>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Modèle</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">{vehiculeSelectionne.modele}</p>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Date MEC</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">{formaterDate(vehiculeSelectionne.dateMEC)}</p>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Kilométrage dernière transaction carburant</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">{vehiculeSelectionne.dernierKm}</p>
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Kilométrage compteur (Webfleet)</label>
                        <p className="text-sm sm:text-base text-gray-900 font-semibold">
                          {gpsData?.odometer_km != null
                            ? `${Number(gpsData.odometer_km).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Informations contractuelles */}
                  <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-600" />
                      Informations contractuelles
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Société porteuse</label>
                        <p className="text-sm sm:text-base text-gray-900">{vehiculeSelectionne.societePorteuse}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Société propriétaire</label>
                        <p className="text-sm sm:text-base text-gray-900">{vehiculeSelectionne.societeProprietaire}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Agence de location</label>
                        <p className="text-sm sm:text-base text-gray-900">{vehiculeSelectionne.agenceLocation}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Fournisseur entretien</label>
                        <p className="text-sm sm:text-base text-gray-900">{vehiculeSelectionne.fournisseurEntretien}</p>
                      </div>
                      <div>
                        <label className="text-xs sm:text-sm font-medium text-gray-600">Tiers propriétaire</label>
                        <p className="text-sm sm:text-base text-gray-900">{vehiculeSelectionne.tiersProprietaire}</p>
                      </div>
                    </div>
                  </div>

                  {/* Contrats d'assurance */}
                  {vehiculeSelectionne.contratsAssurance && vehiculeSelectionne.contratsAssurance.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-blue-600" />
                        Contrats d'assurance ({vehiculeSelectionne.contratsAssurance.length})
                      </h3>
                      <div className="space-y-3">
                        {vehiculeSelectionne.contratsAssurance.map((contrat, idx) => (
                          <div key={idx} className="bg-white rounded-lg p-4 border border-gray-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-gray-600">N° Police</label>
                                <p className="text-sm text-gray-900 font-semibold">{contrat.police}</p>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Assureur</label>
                                <p className="text-sm text-gray-900">{contrat.assureur}</p>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Date début</label>
                                <p className="text-sm text-gray-900">{formaterDate(contrat.dateDebut)}</p>
                              </div>
                              <div>
                                <label className="text-xs font-medium text-gray-600">Date fin</label>
                                <p className="text-sm text-gray-900">{formaterDate(contrat.dateFin)}</p>
                              </div>
                              <div className="sm:col-span-2">
                                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                                  contrat.actif ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {contrat.actif ? 'Actif' : 'Inactif'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extensions Webfleet */}
                  <div className="bg-gray-50 rounded-lg p-4 sm:p-6">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePanel('gps')}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          activePanel === 'gps'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-200'
                        }`}
                      >
                        📍 Position GPS
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePanel('trips')}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${
                          activePanel === 'trips'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-200'
                        }`}
                      >
                        🗺️ Trajets du jour
                      </button>
                    </div>

                    {activePanel === 'gps' ? (
                      <div>
                        <h3 className="mb-3 text-lg font-semibold text-gray-900">Position actuelle</h3>
                        {gpsLoading ? (
                          <p className="text-sm text-gray-600">Chargement position...</p>
                        ) : gpsError ? (
                          <p className="text-sm text-gray-600">{gpsError}</p>
                        ) : gpsData?.latitude == null || gpsData?.longitude == null ? (
                          <p className="text-sm text-gray-600">Véhicule non tracké</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                              <div>
                                Statut: <strong style={{ color: gpsStatusColor(gpsData) }}>{gpsStatusLabel(gpsData)}</strong>
                              </div>
                              <div>
                                Carburant: <strong>{gpsData.fuellevel_pct != null ? `${Number(gpsData.fuellevel_pct).toFixed(0)} %` : '—'}</strong>
                              </div>
                              <div>
                                Kilométrage compteur (Webfleet): <strong>{gpsData.odometer_km != null ? `${Number(gpsData.odometer_km).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} km` : '—'}</strong>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setGpsMapMode((m) => (m === 'standard' ? 'satellite' : 'standard'))}
                              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700"
                            >
                              {gpsMapMode === 'standard' ? 'Passer en Satellite' : 'Passer en Standard'}
                            </button>
                            <div className="h-[250px] overflow-hidden rounded-lg border border-gray-200">
                              <MapContainer
                                center={[Number(gpsData.latitude), Number(gpsData.longitude)]}
                                zoom={13}
                                className="h-full w-full"
                                scrollWheelZoom
                              >
                                {gpsMapMode === 'satellite' ? (
                                  <TileLayer
                                    attribution="Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics"
                                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                  />
                                ) : (
                                  <TileLayer
                                    attribution="&copy; OpenStreetMap contributors"
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                  />
                                )}
                                <CircleMarker
                                  center={[Number(gpsData.latitude), Number(gpsData.longitude)]}
                                  radius={8}
                                  pathOptions={{
                                    color: gpsStatusColor(gpsData),
                                    fillColor: gpsStatusColor(gpsData),
                                    fillOpacity: 0.9,
                                  }}
                                >
                                  <Popup>
                                    <div className="text-sm">
                                      <div>Vitesse: {gpsData.speed != null ? `${gpsData.speed} km/h` : '—'}</div>
                                      <div>{gpsData.postext || 'Position inconnue'}</div>
                                      <div className="text-xs text-gray-500">
                                        {gpsData.pos_time ? formaterDateHeure(gpsData.pos_time) : 'Heure inconnue'}
                                      </div>
                                    </div>
                                  </Popup>
                                </CircleMarker>
                              </MapContainer>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <h3 className="mb-3 text-lg font-semibold text-gray-900">Historique des trajets</h3>
                        <div className="mb-3">
                          <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
                          <input
                            type="date"
                            value={tripDate}
                            onChange={(e) => setTripDate(e.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </div>
                        {tripsLoading ? (
                          <p className="text-sm text-gray-600">Chargement trajets...</p>
                        ) : tripsError ? (
                          <p className="text-sm text-gray-600">{tripsError}</p>
                        ) : (
                          <>
                            <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm md:grid-cols-4">
                              <div>Trajets: <strong>{daySummary.tripCount}</strong></div>
                              <div>Distance: <strong>{daySummary.distanceKm.toFixed(1)} km</strong></div>
                              <div>Durée: <strong>{formatDuration(daySummary.durationSec)}</strong></div>
                              <div>Carburant: <strong>{daySummary.fuelL.toFixed(2)} L</strong></div>
                            </div>
                            {!tripsData.length ? (
                              <p className="text-sm text-gray-600">Aucun trajet ce jour</p>
                            ) : (
                              <>
                                <div className="mb-3 max-h-56 space-y-2 overflow-auto">
                                  {tripsData.map((t) => (
                                    <div key={t.tripid} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                                      <div className="font-semibold text-gray-900">
                                        {t.start_time ? new Date(t.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}{' '}
                                        →{' '}
                                        {t.end_time ? new Date(t.end_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                      </div>
                                      <div className="text-xs text-gray-600">Départ: {shortText(t.start_postext)}</div>
                                      <div className="text-xs text-gray-600">Arrivée: {shortText(t.end_postext)}</div>
                                      <div className="text-xs text-gray-700">
                                        {((Number(t.distance_m) || 0) / 1000).toFixed(2)} km · {formatDuration(t.duration_s)} · {t.avg_speed ?? '—'}/{t.max_speed ?? '—'} km/h · {Number(t.fuel_usage || 0).toFixed(2)} L
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="h-[300px] overflow-hidden rounded-lg border border-gray-200">
                                  <MapContainer center={[46.5, 2.5]} zoom={6} className="h-full w-full" scrollWheelZoom>
                                    <TileLayer
                                      attribution="&copy; OpenStreetMap contributors"
                                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    />
                                    {displayTripSegments.map((seg, idx) => {
                                        const ratio = idx / Math.max(1, displayTripSegments.length - 1)
                                        const b = Math.round(200 - ratio * 120)
                                        return (
                                          <Polyline
                                            key={`sf-trip-${seg.tripid || idx}`}
                                            positions={Array.isArray(seg.path) && seg.path.length ? seg.path : [seg.start, seg.end]}
                                            pathOptions={{ color: `rgb(40,80,${b})`, weight: 4, opacity: 0.85 }}
                                          />
                                        )
                                      })}
                                    <TripBoundsFitter tripSegments={displayTripSegments} tripKey={tripKey} />
                                  </MapContainer>
                                </div>
                                {tripsRouting && (
                                  <p className="mt-2 text-xs text-gray-600">Calcul des itinéraires...</p>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Aucune information disponible</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-gray-50 p-4 sm:p-6 border-t sticky bottom-0">
              <button
                onClick={() => {
                  setModalDetailsOuverte(false)
                  setVehiculeSelectionne(null)
                  setErrorDetails(null)
                }}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
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

function TripBoundsFitter({ tripSegments, tripKey }) {
  const map = useMap()
  const lastFittedKey = useRef('')

  useEffect(() => {
    if (!tripKey || tripKey === lastFittedKey.current) return
    const points = (tripSegments || []).flatMap((s) => {
      if (Array.isArray(s?.path) && s.path.length) return s.path
      return [s?.start, s?.end].filter(Boolean)
    })
    if (points.length) {
      map.fitBounds(points, { padding: [20, 20] })
      lastFittedKey.current = tripKey
    }
  }, [map, tripSegments, tripKey])

  return null
}


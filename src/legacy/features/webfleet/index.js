/**
 * Feature Webfleet — exports publics.
 */

export { default as WebfleetDashboard } from './pages/WebfleetDashboard.jsx';
export { useVehicles } from './hooks/useVehicles.js';
export { useTrips, tripsPaginationMeta } from './hooks/useTrips.js';
export { VehicleMap } from './components/VehicleMap.jsx';
export { VehicleList } from './components/VehicleList.jsx';
export { TripHistory } from './components/TripHistory.jsx';
export { VehicleStatusBadge } from './components/VehicleStatusBadge.jsx';

/**
 * Webfleet — exports barrel
 * @module server/services/webfleet
 */

const { getWebfleetClient, WebfleetClient, extractRows } = require('./webfleetClient');
const { VehicleService, normalizeVehicle } = require('./vehicleService');
const { TripService, normalizeTrip, formatDuration } = require('./tripService');
const { QueueService, QUEUE_NAME, MSG_CLASS } = require('./queueService');

module.exports = {
  getWebfleetClient,
  WebfleetClient,
  extractRows,
  VehicleService,
  normalizeVehicle,
  TripService,
  normalizeTrip,
  formatDuration,
  QueueService,
  QUEUE_NAME,
  MSG_CLASS,
};

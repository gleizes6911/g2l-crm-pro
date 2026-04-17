import { z } from "zod";

const CoordinatesSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const WexVehicleSchema = z.object({
  id: z.string().min(1).optional(),
  plate: z.string().min(1),
  name: z.string().min(1).optional(),
});

const WexDriverSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

export const WexDataSchema = z.object({
  source: z.literal("wex").optional(),
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  vehicle: WexVehicleSchema,
  driver: WexDriverSchema.optional(),
  location: CoordinatesSchema.optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

const WebfleetVehicleSchema = z.object({
  registration: z.string().min(1),
  label: z.string().min(1).optional(),
});

const WebfleetDriverSchema = z.object({
  driverId: z.string().min(1).optional(),
  fullName: z.string().min(1).optional(),
});

export const WebfleetDataSchema = z.object({
  source: z.literal("webfleet").optional(),
  externalId: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  truck: WebfleetVehicleSchema.optional(),
  asset: WebfleetVehicleSchema.optional(),
  chauffeur: WebfleetDriverSchema.optional(),
  position: z
    .object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
    })
    .optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const ImportPayloadSchema = z.object({
  data: z.union([WexDataSchema, WebfleetDataSchema]),
  userId: z.string().cuid().optional().nullable(),
});

export const WexApiTransactionRawSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

export const WexLoginResponseSchema = z.union([
  z.object({ accessToken: z.string().min(1) }),
  z.object({ access_token: z.string().min(1) }),
  z.object({ token: z.string().min(1) }),
]);

export const WexSearchResponseSchema = z.preprocess((input) => {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.transactions)) return { transactions: obj.transactions };
    if (Array.isArray(obj.data)) return { transactions: obj.data };
    if (Array.isArray(obj.items)) return { transactions: obj.items };
  }
  return input;
}, z.object({ transactions: z.array(z.object({ id: z.string().min(1) })) }));

export type WexData = z.infer<typeof WexDataSchema>;
export type WebfleetData = z.infer<typeof WebfleetDataSchema>;
export type ImportPayload = z.infer<typeof ImportPayloadSchema>;
export type WexApiTransactionRaw = z.infer<typeof WexApiTransactionRawSchema>;

import { z } from 'zod';

export const createAddressSchema = z.object({
  body: z.object({
    label: z.string().max(40).optional(),
    houseFlat: z.string().max(120).optional(),
    areaStreet: z.string().min(1).max(200),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    // Optional — the customer isn't necessarily at this address when adding
    // it. Missing coordinates are best-effort filled in server-side.
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    isDefault: z.boolean().optional(),
  }),
});

export const updateAddressSchema = z.object({
  body: z.object({
    label: z.string().max(40).nullable().optional(),
    houseFlat: z.string().max(120).nullable().optional(),
    areaStreet: z.string().min(1).max(200).optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    isDefault: z.boolean().optional(),
  }),
});

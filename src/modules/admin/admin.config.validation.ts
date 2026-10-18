import { z } from 'zod';

// Money in minor units (paise), rates in basis points (100 bps = 1%). Every
// field is optional so a settings card can save just the fields it shows.
const bps = (max: number) => z.coerce.number().int().min(0).max(max);
const minor = z.coerce.number().int().min(0).max(100_000_000);

export const updatePlatformConfigSchema = z.object({
  body: z
    .object({
      orderPickupWindowHours: z.coerce.number().int().positive(),
      // Capped at 50% — a guard against a typo like "100" charging providers everything.
      commissionBps: bps(5000),
      gatewayFeeBps: bps(1000),
      gatewayFeeFlatMinor: minor,
      gatewayFeeAboveMinor: minor,
      gatewayFeeCapMinor: minor,
    })
    .partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' }),
});

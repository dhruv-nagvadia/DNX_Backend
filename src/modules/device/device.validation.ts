import { z } from 'zod';

// FCM registration tokens are ~160+ chars; cap generously to reject junk.
const token = z.string().trim().min(1).max(4096);

export const registerDeviceSchema = z.object({
  body: z.object({
    token,
    platform: z.enum(['ios', 'android']),
    app: z.enum(['customer', 'provider']),
  }),
});

export const unregisterDeviceSchema = z.object({
  body: z.object({ token }),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>['body'];

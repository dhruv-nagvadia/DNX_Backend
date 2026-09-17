import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(2),
    phone: z.string().min(8).optional(),
    // Captured once at signup (typed PIN or GPS) — a fallback location for
    // Home-screen content before the customer sets one explicitly.
    postalCode: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    // Role is decided by the route (customer vs provider), not the client.
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const updateMeSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).optional(),
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    postalCode: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

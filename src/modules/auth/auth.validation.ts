import { z } from 'zod';
import { Role } from '@prisma/client';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(2),
    phone: z.string().min(8).optional(),
    // Only USER or PROVIDER can self-register; ADMIN is created out-of-band.
    role: z.nativeEnum(Role).refine((r) => r !== Role.ADMIN, 'Invalid role').optional(),
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

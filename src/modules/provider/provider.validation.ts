import { z } from 'zod';

export const createProviderSchema = z.object({
  body: z.object({
    businessName: z.string().min(2),
    categoryId: z.string().min(1),
    subcategoryId: z.string().min(1).optional(),
    phone: z.string().min(8),
    email: z.string().email().optional(),
    description: z.string().max(2000).optional(),
    addressLine: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
  }),
});

export const listProviderSchema = z.object({
  query: z.object({
    categorySlug: z.string().optional(),
    subcategorySlug: z.string().optional(),
    city: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const setHoursSchema = z.object({
  body: z.object({
    hours: z
      .array(
        z.object({
          dayOfWeek: z.coerce.number().int().min(0).max(6),
          isOpen: z.boolean(),
          openTime: z.string().regex(TIME_RE, 'Time must be HH:MM'),
          closeTime: z.string().regex(TIME_RE, 'Time must be HH:MM'),
        }),
      )
      .max(7),
  }),
});

// All fields optional — only the provided ones are updated.
export const updateProviderSchema = z.object({
  body: z.object({
    businessName: z.string().min(2).optional(),
    categoryId: z.string().min(1).optional(),
    subcategoryId: z.string().min(1).optional(),
    phone: z.string().min(8).optional(),
    email: z.string().email().optional(),
    description: z.string().max(2000).optional(),
    addressLine: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
  }),
});

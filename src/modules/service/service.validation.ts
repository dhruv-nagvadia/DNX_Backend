import { z } from 'zod';

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0),
    durationMin: z.coerce.number().int().min(1).max(1440),
    currency: z.string().optional(),
    travelRequired: z.coerce.boolean().optional(),
    travelBaseFee: z.coerce.number().min(0).optional(),
    travelPerKm: z.coerce.number().min(0).optional(),
  }),
});

export const searchServiceSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    categorySlug: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    openNow: z.coerce.boolean().optional(),
    sort: z.enum(['rating', 'reviews', 'newest', 'nearest']).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
});

export const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0).optional(),
    durationMin: z.coerce.number().int().min(1).max(1440).optional(),
    isActive: z.boolean().optional(),
    travelRequired: z.coerce.boolean().optional(),
    travelBaseFee: z.coerce.number().min(0).optional(),
    travelPerKm: z.coerce.number().min(0).optional(),
  }),
});

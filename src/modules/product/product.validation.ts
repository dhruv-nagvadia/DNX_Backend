import { z } from 'zod';

const measure = z.enum(['weight', 'volume', 'count']);

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().max(1000).optional(),
    measure: measure.optional(),
    price: z.coerce.number().min(0),
    priceQty: z.coerce.number().positive().optional(),
    stockQty: z.coerce.number().min(0).optional(),
    stepQty: z.coerce.number().positive().optional(),
    section: z.string().max(60).optional(),
    imageUrl: z.string().url().optional(),
    currency: z.string().optional(),
    productTypeId: z.string().min(1).nullable().optional(),
  }),
});

export const searchProductSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    categorySlug: z.string().optional(),
    productTypeSlug: z.string().optional(),
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

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().max(1000).optional(),
    measure: measure.optional(),
    price: z.coerce.number().min(0).optional(),
    priceQty: z.coerce.number().positive().optional(),
    stockQty: z.coerce.number().min(0).optional(),
    stepQty: z.coerce.number().positive().optional(),
    section: z.string().max(60).optional(),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
    productTypeId: z.string().min(1).nullable().optional(),
  }),
});

export const adjustStockSchema = z.object({
  body: z.object({
    delta: z.coerce.number().refine((n) => n !== 0, 'Enter a non-zero amount'),
    reason: z.enum(['SALE', 'RESTOCK', 'DAMAGED', 'OTHER']).optional(),
    note: z.string().max(200).optional(),
  }),
});

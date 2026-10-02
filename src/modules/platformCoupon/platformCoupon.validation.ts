import { z } from 'zod';

const base = {
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _ only'),
  description: z.string().max(200).optional(),
  appliesTo: z.enum(['ANY', 'BOOKING', 'ORDER']).optional(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  discountValue: z.coerce.number().int().positive(),
  minOrderMinor: z.coerce.number().int().min(0).optional(),
  maxDiscountMinor: z.coerce.number().int().positive().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  expiresAt: z.string().datetime().optional(),
  usageLimit: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
};

const percentGuard = (data: { discountType: string; discountValue?: number }) =>
  data.discountType !== 'PERCENT' || (data.discountValue ?? 0) <= 100;

export const createPlatformCouponSchema = z.object({
  body: z.object(base).refine(percentGuard, {
    message: 'A percentage discount must be 100 or less',
    path: ['discountValue'],
  }),
});

export const updatePlatformCouponSchema = z.object({
  body: z
    .object({
      code: base.code.optional(),
      description: base.description,
      appliesTo: base.appliesTo,
      discountType: base.discountType.optional(),
      discountValue: base.discountValue.optional(),
      minOrderMinor: base.minOrderMinor,
      maxDiscountMinor: base.maxDiscountMinor,
      categoryId: base.categoryId,
      expiresAt: base.expiresAt.nullable().optional(),
      usageLimit: base.usageLimit,
      isActive: base.isActive,
    })
    .refine((d) => d.discountType !== 'PERCENT' || (d.discountValue ?? 0) <= 100, {
      message: 'A percentage discount must be 100 or less',
      path: ['discountValue'],
    }),
});

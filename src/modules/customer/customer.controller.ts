import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { absoluteAsset } from '@/utils/assetUrl';
import { providerService } from '@/modules/provider/provider.service';
import { ListProviderQuery } from '@/modules/provider/provider.types';
import { bookingService } from '@/modules/booking/booking.service';
import { platformCouponService } from '@/modules/platformCoupon/platformCoupon.service';

/** DB stores iconUrl as a relative path (e.g. "/assets/product-types/bath-body.png")
 * so it stays portable across environments — made absolute here, the same way
 * category.controller.ts and product.controller.ts build image URLs. */
function withAbsoluteIcon(req: Request, iconUrl: string | null | undefined): string | null | undefined {
  if (!iconUrl || /^https?:\/\//.test(iconUrl)) return iconUrl;
  return `${req.protocol}://${req.get('host')}${iconUrl}`;
}

/**
 * Customer-facing discovery. Reuses the shared provider data layer but only
 * exposes the public, read-only views (active providers + active services).
 */
/** Absolute category / sub-category photo URLs on a provider (its fallback image in the app). */
function withAbsoluteTaxonomy<
  T extends {
    category?: { iconUrl?: string | null; imageUrl?: string | null; bannerUrl?: string | null } | null;
    subcategory?: { imageUrl?: string | null } | null;
  },
>(req: Request, p: T): T {
  return {
    ...p,
    category: p.category
      ? {
          ...p.category,
          iconUrl: absoluteAsset(req, p.category.iconUrl) ?? null,
          imageUrl: absoluteAsset(req, p.category.imageUrl) ?? null,
          bannerUrl: absoluteAsset(req, p.category.bannerUrl) ?? null,
        }
      : p.category,
    subcategory: p.subcategory
      ? { ...p.subcategory, imageUrl: absoluteAsset(req, p.subcategory.imageUrl) ?? null }
      : p.subcategory,
  };
}

/**
 * The business's phone number is NOT part of the public listing/detail —
 * customers only get it on their own bookings and orders (those responses
 * include provider.phone), so contact happens after they've booked/ordered.
 */
function withoutPhone<T extends { phone?: unknown }>(p: T): Omit<T, 'phone'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { phone, ...rest } = p;
  return rest;
}

const listProviders = asyncHandler(async (req: Request, res: Response) => {
  const result = await providerService.list(req.query as unknown as ListProviderQuery);
  sendSuccess(res, {
    ...result,
    items: result.items.map((p) => withoutPhone(withAbsoluteTaxonomy(req, p))),
  });
});

const getProvider = asyncHandler(async (req: Request, res: Response) => {
  const postalCode = typeof req.query.postalCode === 'string' ? req.query.postalCode : undefined;
  const provider = await providerService.getById(req.params.id, postalCode);
  const couponByProductId = await platformCouponService.bestCouponForProducts(
    provider.id,
    provider.categoryId,
    provider.products.map((p) => ({ id: p.id, priceMinor: p.priceMinor })),
  );
  const products = provider.products.map((p) => ({
    ...p,
    productType: p.productType
      ? { ...p.productType, iconUrl: withAbsoluteIcon(req, p.productType.iconUrl) }
      : p.productType,
    coupon: couponByProductId.get(p.id) ?? null,
    // The store's own flag AND this product's — a product can only narrow
    // either further, never re-enable it for a store that's opted out.
    codEnabled: p.codEnabled && provider.codEnabled,
    partialPayEnabled: p.partialPayEnabled && provider.partialPayEnabled,
  }));
  sendSuccess(res, withoutPhone(withAbsoluteTaxonomy(req, { ...provider, products })));
});

/** Upcoming booked intervals, so the app can hide unavailable slots. */
const bookedSlots = asyncHandler(async (req: Request, res: Response) => {
  const slots = await bookingService.bookedSlots(req.params.id);
  sendSuccess(res, slots);
});

export const customerController = { listProviders, getProvider, bookedSlots };

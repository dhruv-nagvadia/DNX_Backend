import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { haversineKm } from '@/utils/geo';
import {
  AdjustStockInput,
  CreateProductInput,
  SearchProductQuery,
  UpdateProductInput,
} from './product.types';

/** Ensures the business exists and is owned by the user; returns it. */
async function assertOwnedProvider(userId: string, providerId: string) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || provider.userId !== userId) throw ApiError.notFound('Business not found');
  return provider;
}

/** Loads a product and confirms it belongs to the given business. */
async function assertProductInProvider(providerId: string, productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.providerId !== providerId) throw ApiError.notFound('Product not found');
  return product;
}

const toMinor = (price: number) => Math.round(price * 100);

/** Base unit label for a measure (weight→g, volume→ml, count→piece). */
const baseUnit = (measure?: string) =>
  measure === 'weight' ? 'g' : measure === 'volume' ? 'ml' : 'piece';

/** All products for an owned business (owner view — includes inactive). */
async function listForOwner(userId: string, providerId: string) {
  await assertOwnedProvider(userId, providerId);
  return prisma.product.findMany({
    where: { providerId },
    include: { productType: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

async function create(userId: string, providerId: string, input: CreateProductInput) {
  await assertOwnedProvider(userId, providerId);
  return prisma.product.create({
    data: {
      providerId,
      name: input.name,
      description: input.description,
      measure: input.measure ?? 'count',
      priceMinor: toMinor(input.price),
      priceQty: input.priceQty ?? 1,
      currency: input.currency ?? 'INR',
      unit: baseUnit(input.measure),
      section: input.section,
      stockQty: input.stockQty ?? 0,
      stepQty: input.stepQty ?? 1,
      imageUrl: input.imageUrl,
      productTypeId: input.productTypeId || null,
    },
  });
}

async function update(
  userId: string,
  providerId: string,
  productId: string,
  input: UpdateProductInput,
) {
  await assertOwnedProvider(userId, providerId);
  await assertProductInProvider(providerId, productId);
  return prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name,
      description: input.description,
      measure: input.measure,
      priceMinor: input.price !== undefined ? toMinor(input.price) : undefined,
      priceQty: input.priceQty,
      unit: input.measure ? baseUnit(input.measure) : undefined,
      section: input.section,
      stockQty: input.stockQty,
      stepQty: input.stepQty,
      imageUrl: input.imageUrl,
      isActive: input.isActive,
      productTypeId: input.productTypeId !== undefined ? input.productTypeId || null : undefined,
    },
  });
}

async function remove(userId: string, providerId: string, productId: string) {
  await assertOwnedProvider(userId, providerId);
  await assertProductInProvider(providerId, productId);
  await prisma.product.delete({ where: { id: productId } });
}

/**
 * Manual stock change outside the normal order flow — an offline/in-person
 * sale, a restock delivery, or damaged/lost goods. Recorded as a
 * StockAdjustment (audit trail) alongside updating the product's own
 * `stockQty`, in one transaction.
 */
async function adjustStock(
  userId: string,
  providerId: string,
  productId: string,
  input: AdjustStockInput,
) {
  await assertOwnedProvider(userId, providerId);
  const product = await assertProductInProvider(providerId, productId);

  const nextStock = product.stockQty + input.delta;
  if (nextStock < 0) {
    throw ApiError.badRequest(`Only ${product.stockQty} ${product.unit} in stock`);
  }

  const [updated] = await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { stockQty: nextStock } }),
    prisma.stockAdjustment.create({
      data: { productId, delta: input.delta, reason: input.reason, note: input.note },
    }),
  ]);
  return updated;
}

// Public search views join through the selling store, so the customer sees
// which business the product is from.
const publicInclude = {
  provider: {
    select: { id: true, businessName: true, city: true, isVerified: true, latitude: true, longitude: true },
  },
  productType: { select: { slug: true, name: true } },
} satisfies Prisma.ProductInclude;

const KM_PER_DEGREE_LAT = 111;
const NEARBY_RADIUS_KM = 50;

function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

// Products have no category/location of their own — those filters apply to
// the store that sells them.
function buildProviderWhere(query: SearchProductQuery): Prisma.ProviderWhereInput {
  const where: Prisma.ProviderWhereInput = { isActive: true };
  if (query.categorySlug) where.category = { slug: query.categorySlug };
  if (query.openNow) {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    where.businessHours = {
      some: { dayOfWeek: now.getDay(), isOpen: true, openTime: { lte: hhmm }, closeTime: { gte: hhmm } },
    };
  }
  return where;
}

function buildBaseWhere(query: SearchProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = { isActive: true, provider: buildProviderWhere(query) };
  if (query.minRating) where.ratingAvg = { gte: query.minRating };
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  // Browsing by product type (e.g. "Bath & Body") pools matching products
  // across every store that sells them, regardless of the store's own category.
  if (query.productTypeSlug) where.productType = { slug: query.productTypeSlug };
  return where;
}

/** Active product types, for the "shop by product" browse grid. */
function listProductTypes() {
  return prisma.productType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
}

/** Public product search — matches by name; category/open-now/location filter on the selling store. */
async function searchPublic(query: SearchProductQuery) {
  const baseWhere = buildBaseWhere(query);

  if (query.sort === 'nearest' && query.lat != null && query.lng != null) {
    const lat = query.lat;
    const lng = query.lng;
    const providerWhere = buildProviderWhere(query);
    if (query.city) providerWhere.city = { equals: query.city, mode: 'insensitive' };
    if (query.postalCode) providerWhere.postalCode = { startsWith: query.postalCode };

    const box = boundingBox(lat, lng, NEARBY_RADIUS_KM);
    const nearbyWhere: Prisma.ProductWhereInput = {
      ...baseWhere,
      provider: {
        ...providerWhere,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
    };

    let candidates = await prisma.product.findMany({ where: nearbyWhere, include: publicInclude });
    if (candidates.length === 0) {
      candidates = await prisma.product.findMany({
        where: { ...baseWhere, provider: providerWhere },
        include: publicInclude,
      });
    }

    const withDistance = candidates.map((p) => ({
      ...p,
      distanceKm:
        p.provider.latitude != null && p.provider.longitude != null
          ? Math.round(haversineKm(lat, lng, p.provider.latitude, p.provider.longitude) * 10) / 10
          : null,
    }));
    withDistance.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return b.ratingAvg - a.ratingAvg;
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
    const total = withDistance.length;
    const skip = (query.page - 1) * query.limit;
    return {
      items: withDistance.slice(skip, skip + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === 'reviews'
      ? [{ ratingCount: 'desc' }, { ratingAvg: 'desc' }]
      : query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }];

  const skip = (query.page - 1) * query.limit;
  const baseProviderWhere = buildProviderWhere(query);

  // Same postal → city → state widening fallback as provider search, applied
  // to the selling store's location.
  const tiers: Prisma.ProviderWhereInput[] = [];
  if (query.postalCode) tiers.push({ ...baseProviderWhere, postalCode: { startsWith: query.postalCode } });
  if (query.city) tiers.push({ ...baseProviderWhere, city: { equals: query.city, mode: 'insensitive' } });
  if (query.state) tiers.push({ ...baseProviderWhere, state: { equals: query.state, mode: 'insensitive' } });

  let where: Prisma.ProductWhereInput = baseWhere;
  for (const tierProviderWhere of tiers) {
    const tierWhere: Prisma.ProductWhereInput = { ...baseWhere, provider: tierProviderWhere };
    // eslint-disable-next-line no-await-in-loop
    const count = await prisma.product.count({ where: tierWhere });
    where = tierWhere;
    if (count > 0) break;
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: query.limit, orderBy, include: publicInclude }),
    prisma.product.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export const productService = {
  listForOwner,
  create,
  update,
  remove,
  adjustStock,
  searchPublic,
  listProductTypes,
};

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { haversineKm } from '@/utils/geo';
import { CreateServiceInput, SearchServiceQuery, UpdateServiceInput } from './service.types';

/** Ensures the business exists and is owned by the user; returns it. */
async function assertOwnedProvider(userId: string, providerId: string) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || provider.userId !== userId) throw ApiError.notFound('Business not found');
  return provider;
}

/** Loads a service and confirms it belongs to the given business. */
async function assertServiceInProvider(providerId: string, serviceId: string) {
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.providerId !== providerId) throw ApiError.notFound('Service not found');
  return service;
}

const toMinor = (price: number) => Math.round(price * 100);

async function create(userId: string, providerId: string, input: CreateServiceInput) {
  const provider = await assertOwnedProvider(userId, providerId);
  return prisma.service.create({
    data: {
      providerId,
      categoryId: provider.categoryId, // inherit the business's category
      name: input.name,
      description: input.description,
      priceMinor: toMinor(input.price),
      currency: input.currency ?? 'INR',
      durationMin: input.durationMin,
      travelRequired: input.travelRequired ?? false,
      travelBaseFeeMinor: toMinor(input.travelBaseFee ?? 0),
      travelPerKmMinor: toMinor(input.travelPerKm ?? 0),
    },
  });
}

async function update(
  userId: string,
  providerId: string,
  serviceId: string,
  input: UpdateServiceInput,
) {
  await assertOwnedProvider(userId, providerId);
  await assertServiceInProvider(providerId, serviceId);
  return prisma.service.update({
    where: { id: serviceId },
    data: {
      name: input.name,
      description: input.description,
      priceMinor: input.price !== undefined ? toMinor(input.price) : undefined,
      durationMin: input.durationMin,
      isActive: input.isActive,
      travelRequired: input.travelRequired,
      travelBaseFeeMinor: input.travelBaseFee !== undefined ? toMinor(input.travelBaseFee) : undefined,
      travelPerKmMinor: input.travelPerKm !== undefined ? toMinor(input.travelPerKm) : undefined,
    },
  });
}

async function remove(userId: string, providerId: string, serviceId: string) {
  await assertOwnedProvider(userId, providerId);
  await assertServiceInProvider(providerId, serviceId);
  await prisma.service.delete({ where: { id: serviceId } });
}

// Public search views join through the offering business, and carry the
// service's own category for display (e.g. an icon).
const publicInclude = {
  category: { select: { slug: true, name: true } },
  provider: {
    select: {
      id: true,
      businessName: true,
      city: true,
      isVerified: true,
      ratingAvg: true,
      ratingCount: true,
      latitude: true,
      longitude: true,
    },
  },
} satisfies Prisma.ServiceInclude;

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

// A service has no rating/location of its own — those apply to the business
// offering it.
function buildProviderWhere(query: SearchServiceQuery): Prisma.ProviderWhereInput {
  const where: Prisma.ProviderWhereInput = { isActive: true };
  if (query.minRating) where.ratingAvg = { gte: query.minRating };
  if (query.openNow) {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    where.businessHours = {
      some: { dayOfWeek: now.getDay(), isOpen: true, openTime: { lte: hhmm }, closeTime: { gte: hhmm } },
    };
  }
  return where;
}

function buildBaseWhere(query: SearchServiceQuery): Prisma.ServiceWhereInput {
  const where: Prisma.ServiceWhereInput = { isActive: true, provider: buildProviderWhere(query) };
  if (query.categorySlug) where.category = { slug: query.categorySlug };
  if (query.search) where.name = { contains: query.search, mode: 'insensitive' };
  return where;
}

/** Public service search — matches by name (e.g. "haircut"); rating/open-now/location filter on the offering business. */
async function searchPublic(query: SearchServiceQuery) {
  const baseWhere = buildBaseWhere(query);

  if (query.sort === 'nearest' && query.lat != null && query.lng != null) {
    const lat = query.lat;
    const lng = query.lng;
    const providerWhere = buildProviderWhere(query);
    if (query.city) providerWhere.city = { equals: query.city, mode: 'insensitive' };
    if (query.postalCode) providerWhere.postalCode = { startsWith: query.postalCode };

    const box = boundingBox(lat, lng, NEARBY_RADIUS_KM);
    const nearbyWhere: Prisma.ServiceWhereInput = {
      ...baseWhere,
      provider: {
        ...providerWhere,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
    };

    let candidates = await prisma.service.findMany({ where: nearbyWhere, include: publicInclude });
    if (candidates.length === 0) {
      candidates = await prisma.service.findMany({
        where: { ...baseWhere, provider: providerWhere },
        include: publicInclude,
      });
    }

    const withDistance = candidates.map((s) => ({
      ...s,
      distanceKm:
        s.provider.latitude != null && s.provider.longitude != null
          ? Math.round(haversineKm(lat, lng, s.provider.latitude, s.provider.longitude) * 10) / 10
          : null,
    }));
    withDistance.sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return b.provider.ratingAvg - a.provider.ratingAvg;
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

  const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
    query.sort === 'reviews'
      ? [{ provider: { ratingCount: 'desc' } }, { provider: { ratingAvg: 'desc' } }]
      : query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : [{ provider: { ratingAvg: 'desc' } }, { provider: { ratingCount: 'desc' } }];

  const skip = (query.page - 1) * query.limit;
  const baseProviderWhere = buildProviderWhere(query);

  // Same postal → city → state widening fallback as provider search, applied
  // to the offering business's location.
  const tiers: Prisma.ProviderWhereInput[] = [];
  if (query.postalCode) tiers.push({ ...baseProviderWhere, postalCode: { startsWith: query.postalCode } });
  if (query.city) tiers.push({ ...baseProviderWhere, city: { equals: query.city, mode: 'insensitive' } });
  if (query.state) tiers.push({ ...baseProviderWhere, state: { equals: query.state, mode: 'insensitive' } });

  let where: Prisma.ServiceWhereInput = baseWhere;
  for (const tierProviderWhere of tiers) {
    const tierWhere: Prisma.ServiceWhereInput = { ...baseWhere, provider: tierProviderWhere };
    // eslint-disable-next-line no-await-in-loop
    const count = await prisma.service.count({ where: tierWhere });
    where = tierWhere;
    if (count > 0) break;
  }

  const [items, total] = await Promise.all([
    prisma.service.findMany({ where, skip, take: query.limit, orderBy, include: publicInclude }),
    prisma.service.count({ where }),
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

export const serviceService = { create, update, remove, searchPublic };

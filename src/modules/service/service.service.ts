import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import {
  compareBySort,
  distanceFrom,
  pickRadiusTier,
  resolveOrigin,
  withinMaxBox,
} from '@/modules/geo/nearby';
import { visibleToCustomers } from '@/modules/provider/provider.visibility';
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
      partialPayEnabled: input.partialPayEnabled ?? true,
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
      partialPayEnabled: input.partialPayEnabled,
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
  category: { select: { slug: true, name: true, imageUrl: true } },
  provider: {
    select: {
      id: true,
      businessName: true,
      // Photo fallbacks for service cards (Home "Popular services"): business
      // photo → sub-category photo → category photo.
      images: true,
      subcategory: { select: { slug: true, name: true, imageUrl: true } },
      city: true,
      isVerified: true,
      ratingAvg: true,
      ratingCount: true,
      latitude: true,
      longitude: true,
    },
  },
} satisfies Prisma.ServiceInclude;

function buildProviderWhere(query: SearchServiceQuery): Prisma.ProviderWhereInput {
  const where: Prisma.ProviderWhereInput = { ...visibleToCustomers };
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

// Bookings that count towards a service's popularity (cancelled ones don't).
const popularityCount = {
  _count: { select: { bookings: { where: { status: { not: 'CANCELLED' as const } } } } },
} satisfies Prisma.ServiceInclude;

/**
 * One service per business: each business's most-booked service (oldest
 * first on a tie, i.e. its main/original service). Keeps the input's order
 * of businesses, so call it on an already-ranked list. Drops the booking
 * count from the response.
 */
function onePerBusiness<
  T extends { providerId: string; createdAt: Date; _count: { bookings: number } },
>(ranked: T[]): Omit<T, '_count'>[] {
  const best = new Map<string, T>();
  for (const s of ranked) {
    const cur = best.get(s.providerId);
    if (
      !cur ||
      s._count.bookings > cur._count.bookings ||
      (s._count.bookings === cur._count.bookings && s.createdAt < cur.createdAt)
    ) {
      best.set(s.providerId, s);
    }
  }
  const seen = new Set<string>();
  const out: Omit<T, '_count'>[] = [];
  for (const s of ranked) {
    if (seen.has(s.providerId)) continue;
    seen.add(s.providerId);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _count, ...rest } = best.get(s.providerId) as T;
    out.push(rest);
  }
  return out;
}

/** Public service search — matches by name (e.g. "haircut"); rating/open-now/location filter on the offering business. */
async function searchPublic(query: SearchServiceQuery) {
  const baseWhere = buildBaseWhere(query);

  // Same distance rings as the business list (10 → 20 → 50 → 100 km) around
  // the customer's coordinates or their PIN-code centre; text matching on
  // postal/city/state below is only the fallback when we can't place them.
  const origin = await resolveOrigin(query);
  if (origin) {
    const candidates = await prisma.service.findMany({
      where: { ...baseWhere, provider: { ...buildProviderWhere(query), ...withinMaxBox(origin) } },
      include: { ...publicInclude, ...popularityCount },
    });
    const withDistance = candidates.map((s) => ({
      ...s,
      distanceKm: distanceFrom(origin, s.provider.latitude, s.provider.longitude),
    }));
    const { items: inRing, radiusKm } = pickRadiusTier(withDistance);
    // Ranked by the business's rating / reviews / distance (services have no
    // rating of their own); "newest" uses the service's own creation date.
    const cmp = compareBySort(query.sort);
    inRing.sort((a, b) =>
      cmp(
        { ...a.provider, distanceKm: a.distanceKm, createdAt: a.createdAt },
        { ...b.provider, distanceKm: b.distanceKm, createdAt: b.createdAt },
      ),
    );
    // Businesses share one rating, so a top business's services would all
    // sit together — Popular services asks for one (its most-booked) each.
    const ranked = query.onePerProvider
      ? onePerBusiness(inRing)
      : inRing.map(({ _count, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars

    const total = ranked.length;
    const skip = (query.page - 1) * query.limit;
    return {
      items: ranked.slice(skip, skip + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      radiusKm,
    };
  }

  const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
    query.sort === 'reviews'
      ? [{ provider: { ratingCount: 'desc' } }, { provider: { ratingAvg: 'desc' } }]
      : query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : [{ provider: { ratingAvg: 'desc' } }, { provider: { ratingCount: 'desc' } }, { createdAt: 'asc' }];

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

  if (query.onePerProvider) {
    // Needs every match to pick each business's best service, so it's paged in memory.
    const all = await prisma.service.findMany({
      where,
      orderBy,
      include: { ...publicInclude, ...popularityCount },
    });
    const ranked = onePerBusiness(all);
    return {
      items: ranked.slice(skip, skip + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: ranked.length,
        totalPages: Math.ceil(ranked.length / query.limit),
      },
      radiusKm: null as number | null,
    };
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
    radiusKm: null as number | null,
  };
}

export const serviceService = { create, update, remove, searchPublic };

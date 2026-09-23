import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { haversineKm } from '@/utils/geo';
import {
  CreateProviderInput,
  ListProviderQuery,
  UpdateProviderInput,
  BusinessHourInput,
  DateHourInput,
} from './provider.types';

// Public views show only active services.
const publicInclude = {
  category: true,
  subcategory: true,
  services: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
  businessHours: { orderBy: { dayOfWeek: 'asc' } },
} satisfies Prisma.ProviderInclude;

// The owner sees ALL their services/products (so they can re-enable inactive ones).
const ownerInclude = {
  category: true,
  subcategory: true,
  services: { orderBy: { createdAt: 'asc' } },
  products: { orderBy: { createdAt: 'asc' } },
  businessHours: { orderBy: { dayOfWeek: 'asc' } },
} satisfies Prisma.ProviderInclude;

/** Every non-location filter shared across all tiers of a listing. */
function buildBaseWhere(query: ListProviderQuery): Prisma.ProviderWhereInput {
  const where: Prisma.ProviderWhereInput = { isActive: true };

  if (query.categorySlug) where.category = { slug: query.categorySlug };
  if (query.subcategorySlug) where.subcategory = { slug: query.subcategorySlug };
  if (query.type) where.type = query.type;
  if (query.minRating) where.ratingAvg = { gte: query.minRating };
  if (query.search) {
    if (query.type === 'SERVICE') {
      // "Service" search matches what the business offers (e.g. "haircut"),
      // not the business's own name.
      where.services = {
        some: { isActive: true, name: { contains: query.search, mode: 'insensitive' } },
      };
    } else {
      // Business-name search — the mobile app's "Business" and "All" search
      // types call this by name only; "All" separately searches services and
      // products via their own endpoints and merges the results client-side.
      where.OR = [
        { businessName: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
  }
  // Open right now, per the weekly schedule (date-specific overrides aren't
  // considered here — this is a quick filter, not the booking-time check).
  if (query.openNow) {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5); // "HH:MM", local server time
    where.businessHours = {
      some: { dayOfWeek: now.getDay(), isOpen: true, openTime: { lte: hhmm }, closeTime: { gte: hhmm } },
    };
  }
  return where;
}

export type LocationScope = 'postalCode' | 'city' | 'state' | null;

// km per degree of latitude is ~constant; longitude shrinks with cos(latitude).
const KM_PER_DEGREE_LAT = 111;
// A generous "nearby" radius — enough to cover a typical city/metro area.
// Only providers within this box get the (unavoidably per-row) haversine
// calc; the box itself is a cheap, indexed range check the database does.
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

/** Public listing with category/city/postal/geo/text filters + pagination. */
async function list(query: ListProviderQuery) {
  const baseWhere = buildBaseWhere(query);

  // "Nearest" needs the customer's coordinates — distance isn't a stored
  // column, so the precise haversine calc still happens in-app, but only for
  // providers inside a bounding box the database filters cheaply (indexed),
  // instead of fetching and computing distance for every provider.
  if (query.sort === 'nearest' && query.lat != null && query.lng != null) {
    const lat = query.lat;
    const lng = query.lng;
    const where = { ...baseWhere };
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    if (query.postalCode) where.postalCode = { startsWith: query.postalCode };

    const box = boundingBox(lat, lng, NEARBY_RADIUS_KM);
    const nearbyWhere: Prisma.ProviderWhereInput = {
      ...where,
      latitude: { gte: box.minLat, lte: box.maxLat },
      longitude: { gte: box.minLng, lte: box.maxLng },
    };

    let candidates = await prisma.provider.findMany({ where: nearbyWhere, include: publicInclude });
    // Nothing within the box (a sparse area with no nearby listings) — fall
    // back to a full scan so the customer still sees their least-far
    // options, instead of an empty result. Rare in practice, so the
    // expensive path only runs when the cheap one truly comes up empty.
    if (candidates.length === 0) {
      candidates = await prisma.provider.findMany({ where, include: publicInclude });
    }

    const withDistance = candidates.map((p) => ({
      ...p,
      distanceKm:
        p.latitude != null && p.longitude != null
          ? Math.round(haversineKm(lat, lng, p.latitude, p.longitude) * 10) / 10
          : null,
    }));
    // Businesses with no set location sort after those with a known distance.
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
      locationScope: null as LocationScope,
    };
  }

  // Ordering: highest rated (default), most reviewed, or newest. ('nearest'
  // without coordinates falls back to this — there's nothing to sort by.)
  const orderBy: Prisma.ProviderOrderByWithRelationInput[] =
    query.sort === 'reviews'
      ? [{ ratingCount: 'desc' }, { ratingAvg: 'desc' }]
      : query.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }];

  const skip = (query.page - 1) * query.limit;

  // Tiered location fallback: try an exact postal-code match first, then
  // widen to the city, then the state — only using tiers whose value the
  // customer actually has (e.g. no city known just skips that tier). Each
  // tier is only queried if the previous one came back empty, so a customer
  // whose exact area has listings never even sees a wider tier attempted.
  const tiers: { scope: Exclude<LocationScope, null>; where: Prisma.ProviderWhereInput }[] = [];
  if (query.postalCode) {
    tiers.push({ scope: 'postalCode', where: { postalCode: { startsWith: query.postalCode } } });
  }
  if (query.city) {
    tiers.push({ scope: 'city', where: { city: { equals: query.city, mode: 'insensitive' } } });
  }
  if (query.state) {
    tiers.push({ scope: 'state', where: { state: { equals: query.state, mode: 'insensitive' } } });
  }

  let locationScope: LocationScope = null;
  let where: Prisma.ProviderWhereInput = baseWhere;

  for (const tier of tiers) {
    const tierWhere = { ...baseWhere, ...tier.where };
    // eslint-disable-next-line no-await-in-loop
    const count = await prisma.provider.count({ where: tierWhere });
    where = tierWhere;
    locationScope = tier.scope;
    // Found something at this tier — stop widening. Otherwise `where`/
    // `locationScope` are left pointing at the last (widest) tier tried, so
    // an all-empty search can still report how far it looked.
    if (count > 0) break;
  }

  const [items, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      skip,
      take: query.limit,
      orderBy,
      include: publicInclude,
    }),
    prisma.provider.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
    locationScope,
  };
}

/**
 * Distinct customers from `postalCode` who've completed a booking or order
 * with this provider — "N people from your area used this provider" social
 * proof. Self-inclusion (the viewer's own past visits) isn't excluded since
 * this endpoint is public/anonymous-friendly and has no reliable viewer identity.
 */
async function areaUsageCount(providerId: string, postalCode: string): Promise<number> {
  const [bookingUsers, orderUsers] = await Promise.all([
    prisma.booking.findMany({
      where: { providerId, status: 'COMPLETED', user: { postalCode } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.order.findMany({
      where: { providerId, status: 'COMPLETED', user: { postalCode } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);
  return new Set([...bookingUsers.map((b) => b.userId), ...orderUsers.map((o) => o.userId)]).size;
}

async function getById(id: string, viewerPostalCode?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const provider = await prisma.provider.findUnique({
    where: { id },
    include: {
      ...publicInclude,
      // Future date-specific overrides, so the app can adjust availability.
      dateHours: { where: { date: { gte: today } }, orderBy: { date: 'asc' } },
      // Catalog for STORE businesses (active items only), grouped by section.
      products: { where: { isActive: true }, orderBy: [{ section: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!provider || !provider.isActive) throw ApiError.notFound('Provider not found');

  const areaCount = viewerPostalCode ? await areaUsageCount(id, viewerPostalCode) : null;
  return { ...provider, areaCount };
}

/**
 * Create a new business owned by the logged-in PROVIDER (many allowed).
 * Provider accounts are separate from customer accounts, so the caller is
 * already a PROVIDER (enforced by the route) — no role promotion needed.
 */
async function create(userId: string, input: CreateProviderInput) {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Invalid categoryId');

  return prisma.provider.create({ data: { ...input, userId }, include: ownerInclude });
}

/** All businesses owned by the logged-in provider (for the businesses list). */
async function listMine(userId: string) {
  return prisma.provider.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: ownerInclude,
  });
}

/** Loads one owned business, enforcing ownership. */
async function getMineById(userId: string, id: string) {
  const provider = await prisma.provider.findUnique({ where: { id }, include: ownerInclude });
  if (!provider || provider.userId !== userId) throw ApiError.notFound('Business not found');
  return provider;
}

/** Updates an owned business. */
async function update(userId: string, id: string, input: UpdateProviderInput) {
  await getMineById(userId, id); // ownership check

  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw ApiError.badRequest('Invalid categoryId');
  }

  return prisma.provider.update({ where: { id }, data: input, include: ownerInclude });
}

/** Append newly uploaded image URLs to an owned business's gallery. */
async function addImages(userId: string, id: string, urls: string[]) {
  await getMineById(userId, id); // ownership check
  return prisma.provider.update({
    where: { id },
    data: { images: { push: urls } },
    include: ownerInclude,
  });
}

/** Replace the gallery with a new ordered list (first = cover) — reorder/remove. */
async function setImages(userId: string, id: string, images: string[]) {
  await getMineById(userId, id); // ownership check
  return prisma.provider.update({ where: { id }, data: { images }, include: ownerInclude });
}

/**
 * Permanently delete an owned business and everything under it. Bookings have
 * no cascade from Provider, so remove them first (their reviews cascade off the
 * booking); deleting the provider then cascades services, hours and overrides.
 */
async function remove(userId: string, id: string) {
  await getMineById(userId, id); // ownership check
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { providerId: id } }),
    prisma.order.deleteMany({ where: { providerId: id } }),
    prisma.provider.delete({ where: { id } }),
  ]);
  return { id };
}

/** Replaces the weekly business hours for an owned business. */
async function setHours(userId: string, id: string, hours: BusinessHourInput[]) {
  await getMineById(userId, id); // ownership check
  await prisma.$transaction([
    prisma.businessHour.deleteMany({ where: { providerId: id } }),
    prisma.businessHour.createMany({
      data: hours.map((h) => ({
        providerId: id,
        dayOfWeek: h.dayOfWeek,
        isOpen: h.isOpen,
        openTime: h.openTime,
        closeTime: h.closeTime,
      })),
    }),
  ]);
  return getMineById(userId, id);
}

/** Date-specific hour overrides, optionally within an inclusive date range. */
async function listDateHours(userId: string, id: string, from?: string, to?: string) {
  await getMineById(userId, id); // ownership check
  const where: Prisma.BusinessDateHourWhereInput = { providerId: id };
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(from);
    if (to) where.date.lte = new Date(to);
  }
  return prisma.businessDateHour.findMany({ where, orderBy: { date: 'asc' } });
}

/** Create or update the hours for one specific date. */
async function setDateHour(userId: string, id: string, input: DateHourInput) {
  await getMineById(userId, id); // ownership check
  const date = new Date(input.date);
  return prisma.businessDateHour.upsert({
    where: { providerId_date: { providerId: id, date } },
    create: {
      providerId: id,
      date,
      isOpen: input.isOpen,
      openTime: input.openTime,
      closeTime: input.closeTime,
    },
    update: { isOpen: input.isOpen, openTime: input.openTime, closeTime: input.closeTime },
  });
}

/** Remove a date override so the day falls back to the weekly hours. */
async function deleteDateHour(userId: string, id: string, date: string) {
  await getMineById(userId, id); // ownership check
  await prisma.businessDateHour.deleteMany({ where: { providerId: id, date: new Date(date) } });
  return { date };
}

export const providerService = {
  list,
  getById,
  create,
  listMine,
  getMineById,
  update,
  remove,
  addImages,
  setImages,
  setHours,
  listDateHours,
  setDateHour,
  deleteDateHour,
};

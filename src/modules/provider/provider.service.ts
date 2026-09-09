import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
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

/** Great-circle distance between two points, in km. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

/** Public listing with category/city/postal/geo/text filters + pagination. */
async function list(query: ListProviderQuery) {
  const where: Prisma.ProviderWhereInput = { isActive: true };

  if (query.categorySlug) where.category = { slug: query.categorySlug };
  if (query.subcategorySlug) where.subcategory = { slug: query.subcategorySlug };
  if (query.type) where.type = query.type;
  if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
  if (query.postalCode) where.postalCode = { startsWith: query.postalCode };
  if (query.minRating) where.ratingAvg = { gte: query.minRating };
  if (query.search) {
    where.OR = [
      { businessName: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
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

  // "Nearest" needs the customer's coordinates — distance isn't a stored
  // column, so it's computed and sorted in-app rather than by the database.
  if (query.sort === 'nearest' && query.lat != null && query.lng != null) {
    const all = await prisma.provider.findMany({ where, include: publicInclude });
    const withDistance = all.map((p) => ({
      ...p,
      distanceKm:
        p.latitude != null && p.longitude != null
          ? Math.round(haversineKm(query.lat!, query.lng!, p.latitude, p.longitude) * 10) / 10
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
  };
}

async function getById(id: string) {
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
  return provider;
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

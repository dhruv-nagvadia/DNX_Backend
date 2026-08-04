import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import {
  CreateProviderInput,
  ListProviderQuery,
  UpdateProviderInput,
  BusinessHourInput,
} from './provider.types';

// Public views show only active services.
const publicInclude = {
  category: true,
  subcategory: true,
  services: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
  businessHours: { orderBy: { dayOfWeek: 'asc' } },
} satisfies Prisma.ProviderInclude;

// The owner sees ALL their services (so they can re-enable inactive ones).
const ownerInclude = {
  category: true,
  subcategory: true,
  services: { orderBy: { createdAt: 'asc' } },
  businessHours: { orderBy: { dayOfWeek: 'asc' } },
} satisfies Prisma.ProviderInclude;

/** Public listing with category/city/text filters + pagination. */
async function list(query: ListProviderQuery) {
  const where: Prisma.ProviderWhereInput = { isActive: true };

  if (query.categorySlug) where.category = { slug: query.categorySlug };
  if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
  if (query.search) {
    where.OR = [
      { businessName: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    prisma.provider.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: [{ ratingAvg: 'desc' }, { createdAt: 'desc' }],
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
  const provider = await prisma.provider.findUnique({ where: { id }, include: publicInclude });
  if (!provider || !provider.isActive) throw ApiError.notFound('Provider not found');
  return provider;
}

/** Create a new business owned by the logged-in provider (many allowed). */
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

export const providerService = {
  list,
  getById,
  create,
  listMine,
  getMineById,
  update,
  addImages,
  setHours,
};

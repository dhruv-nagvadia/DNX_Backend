import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateProviderInput, ListProviderQuery, UpdateProviderInput } from './provider.types';

const detailInclude = {
  category: true,
  services: { where: { isActive: true } },
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
      include: detailInclude,
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
  const provider = await prisma.provider.findUnique({ where: { id }, include: detailInclude });
  if (!provider || !provider.isActive) throw ApiError.notFound('Provider not found');
  return provider;
}

/** Create a new business owned by the logged-in provider (many allowed). */
async function create(userId: string, input: CreateProviderInput) {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Invalid categoryId');

  return prisma.provider.create({ data: { ...input, userId }, include: detailInclude });
}

/** All businesses owned by the logged-in provider (for the businesses list). */
async function listMine(userId: string) {
  return prisma.provider.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: detailInclude,
  });
}

/** Loads one owned business, enforcing ownership. */
async function getMineById(userId: string, id: string) {
  const provider = await prisma.provider.findUnique({ where: { id }, include: detailInclude });
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

  return prisma.provider.update({ where: { id }, data: input, include: detailInclude });
}

/** Append newly uploaded image URLs to an owned business's gallery. */
async function addImages(userId: string, id: string, urls: string[]) {
  await getMineById(userId, id); // ownership check
  return prisma.provider.update({
    where: { id },
    data: { images: { push: urls } },
    include: detailInclude,
  });
}

export const providerService = { list, getById, create, listMine, getMineById, update, addImages };

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateProviderInput, ListProviderQuery } from './provider.types';

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
      include: { category: true, services: { where: { isActive: true } } },
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
  const provider = await prisma.provider.findUnique({
    where: { id },
    include: { category: true, services: { where: { isActive: true } } },
  });
  if (!provider || !provider.isActive) throw ApiError.notFound('Provider not found');
  return provider;
}

/** A provider profile is created by the logged-in provider user (one per account). */
async function create(userId: string, input: CreateProviderInput) {
  const existing = await prisma.provider.findUnique({ where: { userId } });
  if (existing) throw ApiError.conflict('You already have a provider profile');

  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category) throw ApiError.badRequest('Invalid categoryId');

  return prisma.provider.create({
    data: { ...input, userId },
    include: { category: true },
  });
}

/** The logged-in provider's own profile (used by the dashboard). */
async function getMine(userId: string) {
  const provider = await prisma.provider.findUnique({
    where: { userId },
    include: { category: true, services: { where: { isActive: true } } },
  });
  if (!provider) throw ApiError.notFound('No provider profile yet');
  return provider;
}

/** Append newly uploaded image URLs to the provider's gallery. */
async function addImages(userId: string, urls: string[]) {
  const provider = await prisma.provider.findUnique({ where: { userId } });
  if (!provider) throw ApiError.notFound('No provider profile yet');

  return prisma.provider.update({
    where: { userId },
    data: { images: { push: urls } },
    include: { category: true, services: { where: { isActive: true } } },
  });
}

export const providerService = { list, getById, create, getMine, addImages };

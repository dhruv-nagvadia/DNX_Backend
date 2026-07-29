import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';

async function list() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      subcategories: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

async function getBySlug(slug: string) {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: { subcategories: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  });
  if (!category) throw ApiError.notFound('Category not found');
  return category;
}

export const categoryService = { list, getBySlug };

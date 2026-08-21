import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateProductInput, UpdateProductInput } from './product.types';

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
    },
  });
}

async function remove(userId: string, providerId: string, productId: string) {
  await assertOwnedProvider(userId, providerId);
  await assertProductInProvider(providerId, productId);
  await prisma.product.delete({ where: { id: productId } });
}

export const productService = { listForOwner, create, update, remove };

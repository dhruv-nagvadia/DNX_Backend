import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateServiceInput, UpdateServiceInput } from './service.types';

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
    },
  });
}

async function remove(userId: string, providerId: string, serviceId: string) {
  await assertOwnedProvider(userId, providerId);
  await assertServiceInProvider(providerId, serviceId);
  await prisma.service.delete({ where: { id: serviceId } });
}

export const serviceService = { create, update, remove };

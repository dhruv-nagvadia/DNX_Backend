import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { geoService } from '@/modules/geo/geo.service';

export interface CreateAddressInput {
  label?: string;
  houseFlat?: string;
  areaStreet: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export type UpdateAddressInput = Partial<CreateAddressInput> & {
  label?: string | null;
  houseFlat?: string | null;
};

const combineLine = (houseFlat: string | null | undefined, areaStreet: string) =>
  [houseFlat, areaStreet].filter(Boolean).join(', ');

/** Newest first — the default one is marked in place (radio + tag), not pulled to the top. */
async function listMine(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

async function getOwned(userId: string, id: string) {
  const address = await prisma.address.findUnique({ where: { id } });
  if (!address || address.userId !== userId) throw ApiError.notFound('Address not found');
  return address;
}

/** Clears isDefault on the user's other addresses so exactly one stays default. */
async function clearOtherDefaults(userId: string, keepId?: string) {
  await prisma.address.updateMany({
    where: { userId, isDefault: true, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { isDefault: false },
  });
}

async function create(userId: string, input: CreateAddressInput) {
  // A customer's first address becomes their default automatically.
  const isFirst = (await prisma.address.count({ where: { userId } })) === 0;
  const isDefault = input.isDefault ?? isFirst;

  // The customer isn't necessarily at this address (e.g. a parent's house),
  // so coordinates are optional — best-effort fill them in from the postal
  // code/city/state when missing, so the travel fee can still be estimated.
  let latitude = input.latitude;
  let longitude = input.longitude;
  if (latitude == null || longitude == null) {
    const guess = await geoService.forwardGeocode({
      postalCode: input.postalCode,
      city: input.city,
      state: input.state,
    });
    latitude = guess?.latitude;
    longitude = guess?.longitude;
  }

  return prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    }
    return tx.address.create({
      data: {
        userId,
        label: input.label,
        houseFlat: input.houseFlat,
        areaStreet: input.areaStreet,
        line: combineLine(input.houseFlat, input.areaStreet),
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        latitude,
        longitude,
        isDefault,
      },
    });
  });
}

async function update(userId: string, id: string, input: UpdateAddressInput) {
  const existing = await getOwned(userId, id);

  if (input.isDefault) {
    await clearOtherDefaults(userId, id);
  }

  const houseFlat = input.houseFlat === undefined ? existing.houseFlat : input.houseFlat;
  const areaStreet = input.areaStreet ?? existing.areaStreet;

  return prisma.address.update({
    where: { id },
    data: {
      label: input.label,
      houseFlat: input.houseFlat,
      areaStreet: input.areaStreet,
      line: input.houseFlat !== undefined || input.areaStreet !== undefined
        ? combineLine(houseFlat, areaStreet)
        : undefined,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      latitude: input.latitude,
      longitude: input.longitude,
      isDefault: input.isDefault,
    },
  });
}

async function remove(userId: string, id: string) {
  const address = await getOwned(userId, id);
  await prisma.address.delete({ where: { id } });

  // Promote the most recent remaining address so there's always a default
  // once the customer has at least one saved address.
  if (address.isDefault) {
    const next = await prisma.address.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (next) {
      await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }

  return { id };
}

export const addressService = { listMine, create, update, remove };

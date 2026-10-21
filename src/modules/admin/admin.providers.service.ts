import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { commissionService } from '@/modules/commission/commission.service';

const OPEN_BOOKING = ['PENDING', 'CONFIRMED'] as const;
const OPEN_ORDER = ['PENDING', 'CONFIRMED', 'READY'] as const;

/** Open bookings/orders per business — what a block would leave in limbo. */
async function openCounts(businessIds: string[]) {
  const [bookings, orders] = await Promise.all([
    prisma.booking.groupBy({
      by: ['providerId'],
      where: { providerId: { in: businessIds }, status: { in: [...OPEN_BOOKING] } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['providerId'],
      where: { providerId: { in: businessIds }, status: { in: [...OPEN_ORDER] } },
      _count: { _all: true },
    }),
  ]);
  const map = new Map<string, { openBookings: number; openOrders: number }>();
  for (const id of businessIds) map.set(id, { openBookings: 0, openOrders: 0 });
  for (const b of bookings) map.get(b.providerId)!.openBookings = b._count._all;
  for (const o of orders) map.get(o.providerId)!.openOrders = o._count._all;
  return map;
}

/** Provider accounts (not customers), blocked ones first. */
async function list(search?: string) {
  const q = search?.trim();
  const where: Prisma.UserWhereInput = {
    role: Role.PROVIDER,
    providers: { some: {} },
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { providers: { some: { businessName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isBlocked: true,
      blockedReason: true,
      createdAt: true,
      providers: { select: { id: true, isBlocked: true, codDisabledByAdmin: true } },
    },
    orderBy: [{ isBlocked: 'desc' }, { fullName: 'asc' }],
    take: 200,
  });

  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    isBlocked: u.isBlocked,
    blockedReason: u.blockedReason,
    createdAt: u.createdAt,
    businessCount: u.providers.length,
    blockedBusinessCount: u.providers.filter((b) => b.isBlocked).length,
    codDisabledCount: u.providers.filter((b) => b.codDisabledByAdmin).length,
  }));
}

async function detail(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: Role.PROVIDER },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isBlocked: true,
      blockedReason: true,
      blockedAt: true,
      createdAt: true,
    },
  });
  if (!user) throw ApiError.notFound('Provider not found');

  const businesses = await prisma.provider.findMany({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      type: true,
      city: true,
      isActive: true,
      isBlocked: true,
      blockedReason: true,
      blockedAt: true,
      codEnabled: true,
      codDisabledByAdmin: true,
      codDisabledReason: true,
      ratingAvg: true,
      ratingCount: true,
    },
    orderBy: { businessName: 'asc' },
  });
  const [counts, balance] = await Promise.all([
    openCounts(businesses.map((b) => b.id)),
    commissionService.ownerBalance(userId),
  ]);

  return {
    user,
    // What DNX owes them (positive) or they owe DNX (negative) — relevant context for a block decision.
    balanceMinor: balance.balanceMinor,
    businesses: businesses.map((b) => ({ ...b, ...counts.get(b.id)! })),
  };
}

/** Blocks / unblocks a provider's whole account: no login, and every business they own is hidden from customers. */
async function setAccountBlocked(userId: string, isBlocked: boolean, reason?: string) {
  const exists = await prisma.user.findFirst({
    where: { id: userId, role: Role.PROVIDER },
    select: { id: true },
  });
  if (!exists) throw ApiError.notFound('Provider not found');
  return prisma.user.update({
    where: { id: userId },
    data: {
      isBlocked,
      blockedReason: isBlocked ? reason || null : null,
      blockedAt: isBlocked ? new Date() : null,
    },
    select: { id: true, isBlocked: true, blockedReason: true, blockedAt: true },
  });
}

async function getBusiness(businessId: string) {
  const business = await prisma.provider.findUnique({
    where: { id: businessId },
    select: { id: true, codDisabledByAdmin: true },
  });
  if (!business) throw ApiError.notFound('Business not found');
  return business;
}

/** Blocks / unblocks one business: hidden from customers, no new bookings or orders; the owner can still finish open ones. */
async function setBusinessBlocked(businessId: string, isBlocked: boolean, reason?: string) {
  await getBusiness(businessId);
  return prisma.provider.update({
    where: { id: businessId },
    data: {
      isBlocked,
      blockedReason: isBlocked ? reason || null : null,
      blockedAt: isBlocked ? new Date() : null,
    },
    select: { id: true, isBlocked: true, blockedReason: true, blockedAt: true },
  });
}

/**
 * Turns Cash on Delivery off (or back on) for one business. Off switches the
 * business's own codEnabled and every product's, which every customer-facing
 * check already respects; `codDisabledByAdmin` records that it was DNX, so the
 * owner can't flip it back. Turning it back on restores COD for the business
 * and all its products.
 */
async function setBusinessCod(businessId: string, disabled: boolean, reason?: string) {
  await getBusiness(businessId);
  const [business] = await prisma.$transaction([
    prisma.provider.update({
      where: { id: businessId },
      data: {
        codDisabledByAdmin: disabled,
        codDisabledReason: disabled ? reason || null : null,
        codEnabled: !disabled,
      },
      select: { id: true, codEnabled: true, codDisabledByAdmin: true, codDisabledReason: true },
    }),
    prisma.product.updateMany({
      where: { providerId: businessId },
      data: { codEnabled: !disabled },
    }),
  ]);
  return business;
}

export const adminProvidersService = {
  list,
  detail,
  setAccountBlocked,
  setBusinessBlocked,
  setBusinessCod,
};

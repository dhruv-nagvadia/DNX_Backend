import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';

/** Customers (USER-role accounts only — admins manage providers separately
 * via the coupon/analytics surfaces, not here), sorted worst-no-show-first. */
async function list(search?: string) {
  const users = await prisma.user.findMany({
    where: {
      role: Role.USER,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      isBlocked: true,
      codDisabled: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const ids = users.map((u) => u.id);
  const [bookingNoShows, orderNoShows] = await Promise.all([
    prisma.booking.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: 'NO_SHOW' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: 'NO_SHOW' },
      _count: { _all: true },
    }),
  ]);
  const noShowCount = new Map<string, number>();
  for (const r of bookingNoShows) noShowCount.set(r.userId, (noShowCount.get(r.userId) ?? 0) + r._count._all);
  for (const r of orderNoShows) noShowCount.set(r.userId, (noShowCount.get(r.userId) ?? 0) + r._count._all);

  return users
    .map((u) => ({ ...u, noShowCount: noShowCount.get(u.id) ?? 0 }))
    .sort((a, b) => b.noShowCount - a.noShowCount);
}

async function getUser(userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, role: Role.USER } });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function detail(userId: string) {
  const user = await getUser(userId);
  const [noShowBookings, noShowOrders, penalties] = await Promise.all([
    prisma.booking.findMany({
      where: { userId, status: 'NO_SHOW' },
      orderBy: { startTime: 'desc' },
      select: {
        id: true,
        startTime: true,
        amountMinor: true,
        amountPaidMinor: true,
        paymentMethod: true,
        service: { select: { name: true } },
        provider: { select: { businessName: true } },
      },
    }),
    prisma.order.findMany({
      where: { userId, status: 'NO_SHOW' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        amountMinor: true,
        amountPaidMinor: true,
        paymentMethod: true,
        provider: { select: { businessName: true } },
      },
    }),
    prisma.userPenalty.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isBlocked: user.isBlocked,
      blockedReason: user.blockedReason,
      blockedAt: user.blockedAt,
      codDisabled: user.codDisabled,
      createdAt: user.createdAt,
    },
    noShowBookings,
    noShowOrders,
    penalties,
  };
}

async function setBlocked(userId: string, isBlocked: boolean, reason: string | undefined) {
  await getUser(userId);
  return prisma.user.update({
    where: { id: userId },
    data: {
      isBlocked,
      blockedReason: isBlocked ? reason ?? null : null,
      blockedAt: isBlocked ? new Date() : null,
    },
    select: { id: true, isBlocked: true, blockedReason: true, blockedAt: true },
  });
}

async function createPenalty(
  userId: string,
  adminId: string,
  input: { amountMinor: number; reason: string; note?: string },
) {
  await getUser(userId);
  return prisma.userPenalty.create({
    data: {
      userId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      note: input.note,
      createdByAdminId: adminId,
    },
  });
}

async function updatePenaltyStatus(penaltyId: string, status: 'PAID' | 'WAIVED') {
  const penalty = await prisma.userPenalty.findUnique({ where: { id: penaltyId } });
  if (!penalty) throw ApiError.notFound('Penalty not found');
  return prisma.userPenalty.update({ where: { id: penaltyId }, data: { status } });
}

/** Lighter than a full block — this customer just can't choose Cash on
 * Delivery anymore, e.g. after repeated no-shows/refusals. */
async function setCodDisabled(userId: string, codDisabled: boolean) {
  await getUser(userId);
  return prisma.user.update({
    where: { id: userId },
    data: { codDisabled },
    select: { id: true, codDisabled: true },
  });
}

export const adminUsersService = {
  list,
  detail,
  setBlocked,
  setCodDisabled,
  createPenalty,
  updatePenaltyStatus,
};

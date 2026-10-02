import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const DAILY_WINDOW_DAYS = 14;
const GROWTH_WINDOW_DAYS = 30;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Buckets a list of timestamps into a count per day, across the last `days` labels. */
function bucketByDay(rows: { createdAt: Date }[], labels: string[]): number[] {
  const counts = new Map(labels.map((l) => [l, 0]));
  for (const row of rows) {
    const key = dateKey(row.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return labels.map((l) => counts.get(l) ?? 0);
}

/** % change from `prev` to `curr`, treating 0→N as a flat 100%. */
function growthPct(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * Platform-wide overview for the admin dashboard: headline totals, revenue,
 * 30-day growth for customers (the mobile "app" side) vs. providers (the web
 * "business" side), and a 14-day daily series to chart that growth.
 */
async function overview() {
  const since30 = daysAgo(GROWTH_WINDOW_DAYS);
  const prev30Start = daysAgo(GROWTH_WINDOW_DAYS * 2);
  const dailyLabels = Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) =>
    dateKey(daysAgo(DAILY_WINDOW_DAYS - 1 - i)),
  );
  const since14 = daysAgo(DAILY_WINDOW_DAYS - 1);

  const [
    totalCustomers,
    totalProviders,
    totalBusinesses,
    totalBookings,
    totalOrders,
    newCustomers30,
    newProviders30,
    prevCustomers30,
    prevProviders30,
    bookingRevenue,
    orderRevenue,
    recentCustomers,
    recentProviders,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.USER } }),
    prisma.user.count({ where: { role: Role.PROVIDER } }),
    prisma.provider.count(),
    prisma.booking.count(),
    prisma.order.count(),
    prisma.user.count({ where: { role: Role.USER, createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { role: Role.PROVIDER, createdAt: { gte: since30 } } }),
    prisma.user.count({
      where: { role: Role.USER, createdAt: { gte: prev30Start, lt: since30 } },
    }),
    prisma.user.count({
      where: { role: Role.PROVIDER, createdAt: { gte: prev30Start, lt: since30 } },
    }),
    prisma.booking.aggregate({ _sum: { amountPaidMinor: true } }),
    prisma.order.aggregate({ _sum: { amountPaidMinor: true } }),
    prisma.user.findMany({
      where: { role: Role.USER, createdAt: { gte: since14 } },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: Role.PROVIDER, createdAt: { gte: since14 } },
      select: { createdAt: true },
    }),
  ]);

  return {
    totals: {
      customers: totalCustomers,
      providers: totalProviders,
      businesses: totalBusinesses,
      bookings: totalBookings,
      orders: totalOrders,
    },
    revenueMinor: (bookingRevenue._sum.amountPaidMinor ?? 0) + (orderRevenue._sum.amountPaidMinor ?? 0),
    last30Days: {
      newCustomers: newCustomers30,
      newProviders: newProviders30,
      customerGrowthPct: growthPct(newCustomers30, prevCustomers30),
      providerGrowthPct: growthPct(newProviders30, prevProviders30),
    },
    dailyGrowth: {
      labels: dailyLabels,
      customers: bucketByDay(recentCustomers, dailyLabels),
      providers: bucketByDay(recentProviders, dailyLabels),
    },
  };
}

export const adminAnalyticsService = { overview };

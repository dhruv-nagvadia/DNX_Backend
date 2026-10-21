import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { dayKey } from '@/modules/commission/commission.service';

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
    revenueMinor:
      (bookingRevenue._sum.amountPaidMinor ?? 0) + (orderRevenue._sum.amountPaidMinor ?? 0),
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

export type GrowthGroupBy = 'day' | 'month' | 'year';

const IST_OFFSET = '+05:30';
// How far back each view goes.
const GROWTH_DAYS = 14;
const GROWTH_MONTHS = 12;
const GROWTH_MIN_YEARS = 3;
const GROWTH_MAX_YEARS = 10;

/** "2026-10-18" plus `n` days. Done at noon UTC so a day boundary can never slip. */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-10" plus `n` months (n may be negative). */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * New customers vs. new providers per day (last 14 days), per month (last 12
 * months) or per year (at least the last 3, back to the first signup). Months
 * and days follow the Indian calendar, so a signup at 11pm lands on the day it
 * happened. Periods with no signups are included as zeros so the chart has no gaps.
 */
async function growth(groupBy: GrowthGroupBy) {
  const today = dayKey(new Date()); // IST "YYYY-MM-DD"
  const thisMonth = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));

  let labels: string[];
  if (groupBy === 'day') {
    labels = Array.from({ length: GROWTH_DAYS }, (_, i) => addDays(today, i - (GROWTH_DAYS - 1)));
  } else if (groupBy === 'month') {
    labels = Array.from({ length: GROWTH_MONTHS }, (_, i) =>
      addMonths(thisMonth, i - (GROWTH_MONTHS - 1)),
    );
  } else {
    const first = await prisma.user.findFirst({
      where: { role: { in: [Role.USER, Role.PROVIDER] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const firstYear = first ? Number(dayKey(first.createdAt).slice(0, 4)) : thisYear;
    const startYear = Math.max(
      thisYear - (GROWTH_MAX_YEARS - 1),
      Math.min(firstYear, thisYear - (GROWTH_MIN_YEARS - 1)),
    );
    labels = Array.from({ length: thisYear - startYear + 1 }, (_, i) => String(startYear + i));
  }

  // The first instant of the first period, in IST.
  const first = labels[0];
  const startDay =
    groupBy === 'day' ? first : groupBy === 'month' ? `${first}-01` : `${first}-01-01`;
  const since = new Date(`${startDay}T00:00:00${IST_OFFSET}`);

  const users = await prisma.user.findMany({
    where: { role: { in: [Role.USER, Role.PROVIDER] }, createdAt: { gte: since } },
    select: { role: true, createdAt: true },
  });

  const index = new Map(labels.map((l, i) => [l, i]));
  const customers = labels.map(() => 0);
  const providers = labels.map(() => 0);
  for (const u of users) {
    const day = dayKey(u.createdAt);
    const key = groupBy === 'day' ? day : groupBy === 'month' ? day.slice(0, 7) : day.slice(0, 4);
    const i = index.get(key);
    if (i === undefined) continue;
    if (u.role === Role.USER) customers[i] += 1;
    else providers[i] += 1;
  }

  return {
    groupBy,
    labels,
    customers,
    providers,
    totals: {
      customers: customers.reduce((a, b) => a + b, 0),
      providers: providers.reduce((a, b) => a + b, 0),
    },
  };
}

export const adminAnalyticsService = { overview, growth };

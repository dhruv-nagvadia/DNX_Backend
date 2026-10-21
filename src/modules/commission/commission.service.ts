import { BookingStatus, OrderStatus, Prisma, PayoutDirection, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { platformConfigService } from '@/modules/platformConfig/platformConfig.service';
import { LedgerEntry, LedgerRecord, gatewayFeeOf, settle } from './commission.calc';

// The platform operates in India, so "a day" / "a month" are IST calendar
// days — otherwise a late-evening sale would land on the wrong date.
const APP_TZ = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';
const TRANSACTION_LIMIT = 200;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "2026-10-18" — the IST calendar day of a timestamp. */
export function dayKey(d: Date): string {
  return dayFormat.format(d);
}

function startOfDay(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${IST_OFFSET}`);
}

/** Exclusive upper bound: the start of the day AFTER `ymd`. */
function endOfDayExclusive(ymd: string): Date {
  return new Date(startOfDay(ymd).getTime() + 24 * 60 * 60 * 1000);
}

export interface DateRange {
  /** Inclusive IST day, YYYY-MM-DD. */
  from?: string;
  /** Inclusive IST day, YYYY-MM-DD. */
  to?: string;
}

function settledWhere(range: DateRange): { gte?: Date; lt?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: startOfDay(range.from) } : {}),
    ...(range.to ? { lt: endOfDayExclusive(range.to) } : {}),
  };
}

// ── Snapshots taken when a sale is made / paid ──────────────────────────────

/** The commission rate (bps) in force for this business right now. */
async function rateBpsFor(providerId: string): Promise<number> {
  const [provider, config] = await Promise.all([
    prisma.provider.findUnique({ where: { id: providerId }, select: { commissionBps: true } }),
    platformConfigService.getConfig(),
  ]);
  return provider?.commissionBps ?? config.commissionBps;
}

/** What to record on a booking/order when `onlineMinor` goes through the gateway. */
async function onlinePaymentFields(onlineMinor: number) {
  const config = await platformConfigService.getConfig();
  return { onlinePaidMinor: onlineMinor, gatewayFeeMinor: gatewayFeeOf(onlineMinor, config) };
}

/**
 * One gateway payment can cover several orders (a cart with items from more
 * than one store). The gateway charges its fee on the whole payment, so the fee
 * is worked out on the total and then shared across the orders in proportion to
 * what each one paid — the last order takes the rounding remainder, so the
 * shares always add back up to the real fee.
 */
async function onlinePaymentSplit(sharesMinor: number[]) {
  const config = await platformConfigService.getConfig();
  const total = sharesMinor.reduce((a, b) => a + b, 0);
  const totalFee = gatewayFeeOf(total, config);
  let feeLeft = totalFee;
  return sharesMinor.map((share, i) => {
    const fee =
      i === sharesMinor.length - 1 ? feeLeft : Math.round((totalFee * share) / (total || 1));
    feeLeft -= fee;
    return { onlinePaidMinor: share, gatewayFeeMinor: fee };
  });
}

// ── Ledger ──────────────────────────────────────────────────────────────────

type Kind = 'BOOKING' | 'ORDER';

type PaymentMethodName = 'ONLINE' | 'CASH' | 'PARTIAL';

interface LedgerRow {
  kind: Kind;
  id: string;
  businessId: string;
  businessName: string;
  ownerId: string;
  ownerName: string;
  /** Bookings only — the service that was booked. */
  serviceId: string | null;
  title: string;
  customerName: string;
  status: string;
  paymentMethod: PaymentMethodName;
  paymentStatus: string;
  amountMinor: number;
  amountPaidMinor: number;
  refundedMinor: number;
  commissionBps: number;
  gatewayFeeMinor: number;
  /** The gateway payment id this was paid with — store orders from one cart share it. */
  razorpayOrderId: string | null;
  placedAt: Date;
  settledAt: Date | null;
  entry: LedgerEntry;
}

const providerSelect = {
  select: { id: true, businessName: true, userId: true, user: { select: { fullName: true } } },
} satisfies { select: Prisma.ProviderSelect };

/** Open (not yet finished) statuses, as one filter choice. */
const OPEN_STATUSES = ['PENDING', 'CONFIRMED', 'READY'];

/**
 * A status filter for one model. Only store orders have READY, so a status
 * that doesn't exist for this model simply matches nothing (rather than
 * failing the whole query) — e.g. "Open" finds pending/confirmed bookings and
 * pending/confirmed/ready orders.
 */
function statusFilter<T extends string>(status: string | undefined, valid: readonly T[]) {
  if (!status) return {};
  const wanted = status === 'OPEN' ? OPEN_STATUSES : [status];
  return { status: { in: wanted.filter((w): w is T => (valid as readonly string[]).includes(w)) } };
}

interface LedgerFilter {
  /** Restrict to businesses owned by this provider account. */
  ownerId?: string;
  /** Restrict to a single business. */
  businessId?: string;
  /** Bookings of one service (store orders have no service, so none match). */
  serviceId?: string;
  method?: PaymentMethodName;
  kind?: Kind;
  /** A single status, or 'OPEN' for pending/confirmed/ready. */
  status?: string;
  /** Inclusive IST days, applied to when the booking/order was placed. */
  placed?: DateRange;
}

/** Loads every booking and order that has a money story, as uniform rows. */
async function loadRows(filter: LedgerFilter): Promise<LedgerRow[]> {
  const providerWhere: Prisma.ProviderWhereInput = {
    ...(filter.ownerId ? { userId: filter.ownerId } : {}),
    ...(filter.businessId ? { id: filter.businessId } : {}),
  };
  const placedWhere = filter.placed ? settledWhere(filter.placed) : undefined;
  const common = {
    provider: providerWhere,
    ...(filter.method ? { paymentMethod: filter.method } : {}),
    ...(placedWhere ? { createdAt: placedWhere } : {}),
  };
  const wantBookings = filter.kind !== 'ORDER';
  // A service filter only makes sense for bookings.
  const wantOrders = filter.kind !== 'BOOKING' && !filter.serviceId;

  const [bookings, orders] = await Promise.all([
    !wantBookings
      ? Promise.resolve([])
      : prisma.booking.findMany({
          where: {
            ...common,
            ...(filter.serviceId ? { serviceId: filter.serviceId } : {}),
            ...statusFilter<BookingStatus>(filter.status, Object.values(BookingStatus)),
          },
          select: {
            id: true,
            createdAt: true,
            razorpayOrderId: true,
            serviceId: true,
            user: { select: { fullName: true } },
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            amountMinor: true,
            amountPaidMinor: true,
            commissionBps: true,
            onlinePaidMinor: true,
            gatewayFeeMinor: true,
            settledAt: true,
            service: { select: { name: true } },
            provider: providerSelect,
          },
        }),
    !wantOrders
      ? Promise.resolve([])
      : prisma.order.findMany({
          where: {
            ...common,
            ...statusFilter<OrderStatus>(filter.status, Object.values(OrderStatus)),
          },
          select: {
            id: true,
            createdAt: true,
            razorpayOrderId: true,
            user: { select: { fullName: true } },
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            amountMinor: true,
            amountPaidMinor: true,
            refundedMinor: true,
            commissionBps: true,
            onlinePaidMinor: true,
            gatewayFeeMinor: true,
            settledAt: true,
            items: { select: { name: true }, take: 2 },
            _count: { select: { items: true } },
            provider: providerSelect,
          },
        }),
  ]);

  const rows: LedgerRow[] = [];

  for (const b of bookings) {
    const rec: LedgerRecord = {
      status: b.status,
      paymentStatus: b.paymentStatus,
      amountMinor: b.amountMinor ?? 0,
      amountPaidMinor: b.amountPaidMinor,
      refundedMinor: 0,
      commissionBps: b.commissionBps,
      onlinePaidMinor: b.onlinePaidMinor,
    };
    rows.push({
      kind: 'BOOKING',
      id: b.id,
      businessId: b.provider.id,
      businessName: b.provider.businessName,
      ownerId: b.provider.userId,
      ownerName: b.provider.user.fullName,
      serviceId: b.serviceId,
      title: b.service.name,
      customerName: b.user.fullName,
      status: b.status,
      paymentMethod: b.paymentMethod,
      paymentStatus: b.paymentStatus,
      amountMinor: b.amountMinor ?? 0,
      amountPaidMinor: b.amountPaidMinor,
      // A booking refund is all-or-nothing.
      refundedMinor: b.paymentStatus === 'REFUNDED' ? b.amountPaidMinor : 0,
      commissionBps: b.commissionBps,
      gatewayFeeMinor: b.gatewayFeeMinor,
      razorpayOrderId: b.razorpayOrderId,
      placedAt: b.createdAt,
      settledAt: b.settledAt,
      entry: settle(rec),
    });
  }

  for (const o of orders) {
    const rec: LedgerRecord = {
      status: o.status,
      paymentStatus: o.paymentStatus,
      amountMinor: o.amountMinor,
      amountPaidMinor: o.amountPaidMinor,
      refundedMinor: o.refundedMinor,
      commissionBps: o.commissionBps,
      onlinePaidMinor: o.onlinePaidMinor,
    };
    const names = o.items.map((i) => i.name).join(', ');
    const extra = o._count.items - o.items.length;
    rows.push({
      kind: 'ORDER',
      id: o.id,
      businessId: o.provider.id,
      businessName: o.provider.businessName,
      ownerId: o.provider.userId,
      ownerName: o.provider.user.fullName,
      serviceId: null,
      title: extra > 0 ? `${names} +${extra} more` : names || 'Order',
      customerName: o.user.fullName,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      amountMinor: o.amountMinor,
      amountPaidMinor: o.amountPaidMinor,
      refundedMinor: o.paymentStatus === 'REFUNDED' ? o.amountPaidMinor : o.refundedMinor,
      commissionBps: o.commissionBps,
      gatewayFeeMinor: o.gatewayFeeMinor,
      razorpayOrderId: o.razorpayOrderId,
      placedAt: o.createdAt,
      settledAt: o.settledAt,
      entry: settle(rec),
    });
  }

  return rows;
}

interface Totals {
  count: number;
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  onlineMinor: number;
  cashMinor: number;
}

function emptyTotals(): Totals {
  return { count: 0, grossMinor: 0, commissionMinor: 0, netMinor: 0, onlineMinor: 0, cashMinor: 0 };
}

function addTo(t: Totals, e: LedgerEntry) {
  t.count += 1;
  t.grossMinor += e.keptMinor;
  t.commissionMinor += e.commissionMinor;
  t.netMinor += e.earningMinor;
  t.onlineMinor += e.onlineHeldMinor;
  t.cashMinor += e.cashMinor;
}

function inRange(date: Date | null, range: DateRange): boolean {
  if (!date) return false;
  const w = settledWhere(range);
  if (!w) return true;
  if (w.gte && date < w.gte) return false;
  if (w.lt && date >= w.lt) return false;
  return true;
}

/** Sum of manual settlements per provider account. */
async function payoutTotals(ownerId?: string) {
  const grouped = await prisma.providerPayout.groupBy({
    by: ['userId', 'direction'],
    where: ownerId ? { userId: ownerId } : undefined,
    _sum: { amountMinor: true },
  });
  const map = new Map<string, { toMinor: number; fromMinor: number }>();
  for (const g of grouped) {
    const cur = map.get(g.userId) ?? { toMinor: 0, fromMinor: 0 };
    if (g.direction === 'TO_PROVIDER') cur.toMinor += g._sum.amountMinor ?? 0;
    else cur.fromMinor += g._sum.amountMinor ?? 0;
    map.set(g.userId, cur);
  }
  return map;
}

/**
 * What the platform owes a provider account (positive) or what they owe the
 * platform (negative). The platform holds the online payments, so it owes the
 * provider those minus its commission on every finished sale; commission on
 * cash sales (which the provider already holds) is therefore a debt to settle.
 */
function balanceOf(rows: LedgerRow[], payouts: { toMinor: number; fromMinor: number } | undefined) {
  let earnedOnline = 0;
  let commission = 0;
  for (const r of rows) {
    if (r.entry.state !== 'EARNED') continue;
    earnedOnline += r.entry.onlineHeldMinor;
    commission += r.entry.commissionMinor;
  }
  const to = payouts?.toMinor ?? 0;
  const from = payouts?.fromMinor ?? 0;
  return {
    // The pieces the provider sees as "how your payout is worked out".
    earnedOnlineMinor: earnedOnline,
    earnedCommissionMinor: commission,
    paidOutMinor: to,
    receivedMinor: from,
    balanceMinor: earnedOnline - commission - to + from,
  };
}

// ── Provider view ───────────────────────────────────────────────────────────

async function providerEarnings(ownerId: string, range: DateRange, businessId?: string) {
  const [rows, payoutMap, businesses] = await Promise.all([
    loadRows({ ownerId, businessId }),
    payoutTotals(ownerId),
    prisma.provider.findMany({
      where: { userId: ownerId },
      select: { id: true, businessName: true, commissionBps: true },
    }),
  ]);
  const config = await platformConfigService.getConfig();

  const summary = emptyTotals();
  const upcoming = emptyTotals();
  const perBusiness = new Map<string, Totals>();
  const earnedRows: LedgerRow[] = [];

  for (const r of rows) {
    if (r.entry.state === 'UPCOMING') {
      addTo(upcoming, r.entry);
    } else if (r.entry.state === 'EARNED' && inRange(r.settledAt, range)) {
      addTo(summary, r.entry);
      const t = perBusiness.get(r.businessId) ?? emptyTotals();
      addTo(t, r.entry);
      perBusiness.set(r.businessId, t);
      earnedRows.push(r);
    }
  }

  earnedRows.sort((a, b) => (b.settledAt?.getTime() ?? 0) - (a.settledAt?.getTime() ?? 0));

  // The balance is all-time and across every business, whatever filter is set.
  const allRows = businessId ? await loadRows({ ownerId }) : rows;
  const balance = balanceOf(allRows, payoutMap.get(ownerId));

  const payouts = await prisma.providerPayout.findMany({
    where: { userId: ownerId },
    orderBy: { paidAt: 'desc' },
    take: 20,
  });

  return {
    range,
    // The rate a new sale at each business is charged right now.
    defaultCommissionBps: config.commissionBps,
    summary,
    upcoming,
    balance,
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.businessName,
      commissionBps: b.commissionBps ?? config.commissionBps,
      isCustomRate: b.commissionBps != null,
      ...(perBusiness.get(b.id) ?? emptyTotals()),
    })),
    transactions: earnedRows.slice(0, TRANSACTION_LIMIT).map((r) => ({
      kind: r.kind,
      id: r.id,
      businessId: r.businessId,
      businessName: r.businessName,
      title: r.title,
      status: r.status,
      paymentMethod: r.paymentMethod,
      settledAt: r.settledAt,
      commissionBps: r.commissionBps,
      grossMinor: r.entry.keptMinor,
      commissionMinor: r.entry.commissionMinor,
      earningMinor: r.entry.earningMinor,
      onlineMinor: r.entry.onlineHeldMinor,
      cashMinor: r.entry.cashMinor,
      // What this one sale adds to (or, for cash sales, takes off) what DNX
      // pays the provider: the online money DNX holds, minus its commission.
      payableMinor: r.entry.onlineHeldMinor - r.entry.commissionMinor,
    })),
    payouts: payouts.map(serializePayout),
  };
}

// ── Admin view ──────────────────────────────────────────────────────────────

export type GroupBy = 'day' | 'month';

function seriesKey(d: Date, groupBy: GroupBy): string {
  const day = dayKey(d);
  return groupBy === 'month' ? day.slice(0, 7) : day;
}

/** Platform-wide: gross sales, commission earned, gateway fees and profit. */
async function adminOverview(range: DateRange, groupBy: GroupBy) {
  const rows = await loadRows({});

  const totals = { ...emptyTotals(), gatewayFeesMinor: 0, profitMinor: 0 };
  const upcoming = emptyTotals();
  const buckets = new Map<
    string,
    { count: number; grossMinor: number; commissionMinor: number; gatewayFeeMinor: number }
  >();

  for (const r of rows) {
    if (r.entry.state === 'UPCOMING') {
      addTo(upcoming, r.entry);
      continue;
    }
    // Finished (earned or fully refunded): counted on the day it was settled.
    if (!inRange(r.settledAt, range) || !r.settledAt) continue;

    if (r.entry.state === 'EARNED') addTo(totals, r.entry);
    totals.gatewayFeesMinor += r.gatewayFeeMinor;

    const key = seriesKey(r.settledAt, groupBy);
    const b = buckets.get(key) ?? {
      count: 0,
      grossMinor: 0,
      commissionMinor: 0,
      gatewayFeeMinor: 0,
    };
    if (r.entry.state === 'EARNED') {
      b.count += 1;
      b.grossMinor += r.entry.keptMinor;
      b.commissionMinor += r.entry.commissionMinor;
    }
    b.gatewayFeeMinor += r.gatewayFeeMinor;
    buckets.set(key, b);
  }
  totals.profitMinor = totals.commissionMinor - totals.gatewayFeesMinor;

  const series = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, b]) => ({ key, ...b, profitMinor: b.commissionMinor - b.gatewayFeeMinor }));

  return { range, groupBy, totals, upcoming, series };
}

/** One provider account's running balance (what DNX owes them, or they owe DNX). */
async function ownerBalance(ownerId: string) {
  const [rows, payoutMap] = await Promise.all([loadRows({ ownerId }), payoutTotals(ownerId)]);
  return balanceOf(rows, payoutMap.get(ownerId));
}

/** Per provider account: what they've earned, been paid, and what's still owed either way. */
async function adminBalances() {
  const [rows, payoutMap, owners] = await Promise.all([
    loadRows({}),
    payoutTotals(),
    prisma.user.findMany({
      where: { role: Role.PROVIDER, providers: { some: {} } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        _count: { select: { providers: true } },
      },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  const byOwner = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const list = byOwner.get(r.ownerId) ?? [];
    list.push(r);
    byOwner.set(r.ownerId, list);
  }

  return owners.map((o) => {
    const ownerRows = byOwner.get(o.id) ?? [];
    const earned = emptyTotals();
    for (const r of ownerRows) if (r.entry.state === 'EARNED') addTo(earned, r.entry);
    return {
      userId: o.id,
      name: o.fullName,
      email: o.email,
      phone: o.phone,
      businessCount: o._count.providers,
      grossMinor: earned.grossMinor,
      commissionMinor: earned.commissionMinor,
      netMinor: earned.netMinor,
      ...balanceOf(ownerRows, payoutMap.get(o.id)),
    };
  });
}

// ── Admin: transactions ─────────────────────────────────────────────────────

/** Running totals for any set of bookings/orders. */
interface Agg {
  completedCount: number;
  /** Value of completed sales (plus payments kept after a no-show / late cancel). */
  grossMinor: number;
  /** Of that, paid through the gateway (DNX holds it). */
  onlineMinor: number;
  /** Of that, collected in person by the provider (cash / COD / the cash part of a partial). */
  cashMinor: number;
  commissionMinor: number;
  gatewayFeeMinor: number;
  /** What the providers keep after commission. */
  earningMinor: number;
  /** Online money held minus commission: what DNX still has to pass on. Negative = commission to take back. */
  payableMinor: number;
  upcomingCount: number;
  upcomingMinor: number;
  cancelledCount: number;
  refundedMinor: number;
  methods: Record<PaymentMethodName, number>;
}

function emptyAgg(): Agg {
  return {
    completedCount: 0,
    grossMinor: 0,
    onlineMinor: 0,
    cashMinor: 0,
    commissionMinor: 0,
    gatewayFeeMinor: 0,
    earningMinor: 0,
    payableMinor: 0,
    upcomingCount: 0,
    upcomingMinor: 0,
    cancelledCount: 0,
    refundedMinor: 0,
    methods: { ONLINE: 0, CASH: 0, PARTIAL: 0 },
  };
}

function addRow(a: Agg, r: LedgerRow) {
  const e = r.entry;
  // The gateway keeps its fee even when the payment is later refunded.
  a.gatewayFeeMinor += r.gatewayFeeMinor;
  a.refundedMinor += r.refundedMinor;
  if (e.state === 'EARNED') {
    a.completedCount += 1;
    a.grossMinor += e.keptMinor;
    a.onlineMinor += e.onlineHeldMinor;
    a.cashMinor += e.cashMinor;
    a.commissionMinor += e.commissionMinor;
    a.earningMinor += e.earningMinor;
    a.payableMinor += e.onlineHeldMinor - e.commissionMinor;
    a.methods[r.paymentMethod] += 1;
  } else if (e.state === 'UPCOMING') {
    a.upcomingCount += 1;
    a.upcomingMinor += e.keptMinor;
  } else {
    a.cancelledCount += 1;
  }
}

/** What the customer paid in the one payment this order was part of (set when a cart spanned several stores). */
interface SharedPayment {
  orders: number;
  totalMinor: number;
}

function toTransaction(r: LedgerRow, shared?: SharedPayment) {
  const e = r.entry;
  return {
    kind: r.kind,
    id: r.id,
    placedAt: r.placedAt,
    settledAt: r.settledAt,
    sharedPayment: shared ?? null,
    businessId: r.businessId,
    businessName: r.businessName,
    ownerId: r.ownerId,
    ownerName: r.ownerName,
    serviceId: r.serviceId,
    title: r.title,
    customerName: r.customerName,
    status: r.status,
    paymentMethod: r.paymentMethod,
    paymentStatus: r.paymentStatus,
    state: e.state,
    totalMinor: r.amountMinor,
    paidMinor: r.amountPaidMinor,
    // Split of the sale: through the gateway vs. in person. For a sale that
    // hasn't finished, "cash" is what's still due at the venue / on pickup.
    onlineMinor: e.onlineHeldMinor,
    cashMinor: e.cashMinor,
    refundedMinor: r.refundedMinor,
    commissionBps: r.commissionBps,
    commissionMinor: e.commissionMinor,
    gatewayFeeMinor: r.gatewayFeeMinor,
    earningMinor: e.earningMinor,
    // Online money DNX holds for this sale minus its commission. For a cash
    // sale that's just −commission: taken off what DNX owes the provider.
    payableMinor: e.onlineHeldMinor - e.commissionMinor,
  };
}

export interface TransactionQuery extends LedgerFilter {
  /** Matches the service/items, business, customer or provider name, or the id. */
  search?: string;
  page?: number;
  limit?: number;
}

function applySearch(rows: LedgerRow[], search?: string): LedgerRow[] {
  const q = search?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    `${r.title} ${r.businessName} ${r.customerName} ${r.ownerName} ${r.id}`
      .toLowerCase()
      .includes(q),
  );
}

/** Every booking and order with its payment split and commission, newest first, plus totals for the whole filter. */
async function adminTransactions(query: TransactionQuery) {
  const rows = applySearch(await loadRows(query), query.search).sort(
    (a, b) => b.placedAt.getTime() - a.placedAt.getTime(),
  );

  const summary = emptyAgg();
  for (const r of rows) addRow(summary, r);

  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const pageRows = rows.slice((page - 1) * limit, page * limit);

  // A cart from several stores is paid in ONE payment, split into one order per
  // store. Look up, across ALL stores (not just the filtered ones), which of
  // this page's orders were paid together, so the screen can say so.
  const paymentIds = [
    ...new Set(
      pageRows
        .filter((r) => r.kind === 'ORDER' && r.razorpayOrderId)
        .map((r) => r.razorpayOrderId as string),
    ),
  ];
  const sharedBy = new Map<string, SharedPayment>();
  if (paymentIds.length > 0) {
    const groups = await prisma.order.groupBy({
      by: ['razorpayOrderId'],
      where: { razorpayOrderId: { in: paymentIds } },
      _count: { _all: true },
      _sum: { amountPaidMinor: true },
    });
    for (const g of groups) {
      if (g.razorpayOrderId && g._count._all > 1) {
        sharedBy.set(g.razorpayOrderId, {
          orders: g._count._all,
          totalMinor: g._sum.amountPaidMinor ?? 0,
        });
      }
    }
  }

  return {
    summary,
    total: rows.length,
    page,
    limit,
    rows: pageRows.map((r) =>
      toTransaction(
        r,
        r.kind === 'ORDER' && r.razorpayOrderId ? sharedBy.get(r.razorpayOrderId) : undefined,
      ),
    ),
  };
}

/** Totals grouped by business, or by service (bookings only — a store order has no single service). */
async function adminBreakdown(by: 'business' | 'service', query: TransactionQuery) {
  const rows = applySearch(
    await loadRows(by === 'service' ? { ...query, kind: 'BOOKING' } : query),
    query.search,
  );

  const groups = new Map<
    string,
    { id: string; name: string; businessId: string; businessName: string; agg: Agg }
  >();
  for (const r of rows) {
    const key = by === 'service' ? (r.serviceId ?? r.id) : r.businessId;
    const g = groups.get(key) ?? {
      id: key,
      name: by === 'service' ? r.title : r.businessName,
      businessId: r.businessId,
      businessName: r.businessName,
      agg: emptyAgg(),
    };
    addRow(g.agg, r);
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({
      id: g.id,
      name: g.name,
      businessId: g.businessId,
      businessName: g.businessName,
      ...g.agg,
    }))
    .sort((a, b) => b.grossMinor - a.grossMinor || b.upcomingMinor - a.upcomingMinor);
}

/**
 * Every service across all businesses (or one business's), for the admin's
 * "Service" filter — including services nobody has booked yet, which a
 * breakdown of existing bookings would leave out.
 */
async function adminServices(businessId?: string) {
  const services = await prisma.service.findMany({
    where: businessId ? { providerId: businessId } : undefined,
    select: {
      id: true,
      name: true,
      isActive: true,
      provider: { select: { id: true, businessName: true } },
    },
    orderBy: [{ provider: { businessName: 'asc' } }, { name: 'asc' }],
    take: 1000,
  });
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    isActive: s.isActive,
    businessId: s.provider.id,
    businessName: s.provider.businessName,
  }));
}

/** Every business with its commission setting, for the admin to adjust per business. */
async function adminBusinesses(search?: string) {
  const [config, businesses] = await Promise.all([
    platformConfigService.getConfig(),
    prisma.provider.findMany({
      where: search
        ? {
            OR: [
              { businessName: { contains: search, mode: 'insensitive' } },
              { user: { fullName: { contains: search, mode: 'insensitive' } } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : undefined,
      select: {
        id: true,
        businessName: true,
        type: true,
        city: true,
        commissionBps: true,
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { businessName: 'asc' },
      take: 200,
    }),
  ]);

  return {
    defaultCommissionBps: config.commissionBps,
    businesses: businesses.map((b) => ({
      id: b.id,
      name: b.businessName,
      type: b.type,
      city: b.city,
      ownerName: b.user.fullName,
      ownerEmail: b.user.email,
      customCommissionBps: b.commissionBps,
      effectiveCommissionBps: b.commissionBps ?? config.commissionBps,
    })),
  };
}

/** Sets (or, with null, clears) one business's own commission rate. */
async function setBusinessCommission(businessId: string, commissionBps: number | null) {
  const exists = await prisma.provider.findUnique({
    where: { id: businessId },
    select: { id: true },
  });
  if (!exists) throw ApiError.notFound('Business not found');
  await prisma.provider.update({ where: { id: businessId }, data: { commissionBps } });
  const config = await platformConfigService.getConfig();
  return {
    id: businessId,
    customCommissionBps: commissionBps,
    effectiveCommissionBps: commissionBps ?? config.commissionBps,
  };
}

// ── Manual settlements ──────────────────────────────────────────────────────

function serializePayout(p: {
  id: string;
  userId: string;
  direction: PayoutDirection;
  amountMinor: number;
  method: string | null;
  reference: string | null;
  note: string | null;
  paidAt: Date;
}) {
  return {
    id: p.id,
    userId: p.userId,
    direction: p.direction,
    amountMinor: p.amountMinor,
    method: p.method,
    reference: p.reference,
    note: p.note,
    paidAt: p.paidAt,
  };
}

async function recordPayout(input: {
  userId: string;
  direction: PayoutDirection;
  amountMinor: number;
  method?: string;
  reference?: string;
  note?: string;
  paidAt?: Date;
}) {
  const owner = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true },
  });
  if (!owner || owner.role !== Role.PROVIDER) throw ApiError.notFound('Provider account not found');

  const payout = await prisma.providerPayout.create({
    data: {
      userId: input.userId,
      direction: input.direction,
      amountMinor: input.amountMinor,
      method: input.method,
      reference: input.reference,
      note: input.note,
      paidAt: input.paidAt,
    },
  });
  return serializePayout(payout);
}

async function listPayouts(userId?: string) {
  const payouts = await prisma.providerPayout.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { paidAt: 'desc' },
    take: 100,
    include: { user: { select: { fullName: true, email: true } } },
  });
  return payouts.map((p) => ({
    ...serializePayout(p),
    providerName: p.user.fullName,
    providerEmail: p.user.email,
  }));
}

async function deletePayout(id: string) {
  const existing = await prisma.providerPayout.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('Settlement not found');
  await prisma.providerPayout.delete({ where: { id } });
  return { id };
}

export const commissionService = {
  rateBpsFor,
  onlinePaymentFields,
  onlinePaymentSplit,
  providerEarnings,
  adminOverview,
  adminBalances,
  ownerBalance,
  adminTransactions,
  adminBreakdown,
  adminServices,
  adminBusinesses,
  setBusinessCommission,
  recordPayout,
  listPayouts,
  deletePayout,
};

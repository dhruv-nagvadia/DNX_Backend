import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { notificationService, formatINR } from '@/modules/notification/notification.service';
import { couponService } from '@/modules/coupon/coupon.service';
import { CreateOrderInput } from './order.types';

// Customer-facing copy for each order status the provider can move an order to.
const ORDER_STATUS_COPY: Record<OrderStatus, string> = {
  PENDING: 'Your order was received',
  CONFIRMED: 'Your order has been confirmed',
  READY: 'Your order is ready for pickup',
  COMPLETED: 'Your order is complete — thank you!',
  CANCELLED: 'Your order was cancelled',
};

// What the customer app sees for each order (with business + product images).
const orderInclude = {
  items: { include: { product: { select: { imageUrl: true } } } },
  provider: {
    select: {
      id: true,
      businessName: true,
      phone: true,
      images: true,
      category: { select: { slug: true, name: true } },
    },
  },
  review: { select: { id: true, rating: true } },
  productReviews: { select: { productId: true, rating: true } },
} satisfies Prisma.OrderInclude;

// What the provider dashboard sees for each order (adds the customer).
const providerOrderInclude = {
  items: true,
  user: { select: { fullName: true, phone: true } },
  provider: { select: { id: true, businessName: true } },
} satisfies Prisma.OrderInclude;

// Allowed provider-driven order transitions.
const PROVIDER_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Ops that put an order's items back into stock (used when cancelling). */
function restoreStockOps(items: { productId: string | null; quantity: number }[]) {
  return items
    .filter((i): i is { productId: string; quantity: number } => !!i.productId)
    .map((i) =>
      prisma.product.update({
        where: { id: i.productId },
        data: { stockQty: { increment: i.quantity } },
      }),
    );
}

export interface OrderLine {
  productId: string;
  name: string;
  measure: string;
  priceMinor: number;
  priceQty: number;
  unit: string;
  quantity: number;
  lineTotal: number;
}

/** A validated, price-locked cart — everything needed to actually place the
 * order, computed once so a payment attempt and its eventual confirmation
 * agree on exactly what was charged. */
export interface OrderPlan {
  providerId: string;
  providerUserId: string;
  businessName: string;
  method: 'ONLINE' | 'CASH' | 'PARTIAL';
  note?: string;
  lines: OrderLine[];
  subtotal: number;
  discountMinor: number;
  couponId: string | null;
  couponCode: string | null;
  total: number; // subtotal − discount
  depositMinor: number; // only meaningful for PARTIAL
}

/**
 * Validates a cart against live stock/coupon rules and locks in prices. This
 * is the shared first half of order creation — used both for orders placed
 * immediately (CASH, or test mode with no live Razorpay keys) and for the
 * pay-then-place flow (payment.service creates the real order only once the
 * payment is confirmed).
 */
async function buildOrderPlan(input: CreateOrderInput): Promise<OrderPlan> {
  const provider = await prisma.provider.findUnique({ where: { id: input.providerId } });
  if (!provider || !provider.isActive) throw ApiError.badRequest('This store is not available');
  if (provider.type !== 'STORE') {
    throw ApiError.badRequest('This business does not take product orders');
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, providerId: provider.id, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const lines: OrderLine[] = input.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw ApiError.badRequest('A product in your cart is no longer available');
    const amount = i.quantity; // base units (e.g. grams)
    if (amount <= 0) throw ApiError.badRequest('Invalid quantity');
    if (amount < p.stepQty) {
      throw ApiError.badRequest(`Minimum for ${p.name} is ${p.stepQty} ${p.unit}`);
    }
    if (p.stockQty < amount) {
      throw ApiError.badRequest(`Only ${p.stockQty} ${p.unit} of ${p.name} left in stock`);
    }
    // Price scales with the amount: (amount / priceQty) × priceMinor.
    const lineTotal = Math.round((amount / p.priceQty) * p.priceMinor);
    subtotal += lineTotal;
    return {
      productId: p.id,
      name: p.name,
      measure: p.measure,
      priceMinor: p.priceMinor,
      priceQty: p.priceQty,
      unit: p.unit,
      quantity: amount,
      lineTotal,
    };
  });

  // Apply a coupon (if any) to the subtotal; the discount comes off the total.
  let discountMinor = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: {
        providerId_code: {
          providerId: provider.id,
          code: couponService.normalizeCode(input.couponCode),
        },
      },
    });
    if (!coupon) throw ApiError.badRequest('That code isn’t valid for this store.');
    const evaluated = couponService.evaluateCoupon(coupon, {
      subtotalMinor: subtotal,
      items: lines.map((l) => ({ productId: l.productId, lineTotalMinor: l.lineTotal })),
    });
    if (evaluated.error) throw ApiError.badRequest(evaluated.error);
    discountMinor = evaluated.discountMinor;
    couponId = coupon.id;
    couponCode = coupon.code;
  }

  const total = subtotal - discountMinor;
  const method = input.paymentMethod ?? 'ONLINE';
  const depositPct = method === 'PARTIAL' ? provider.depositPercent || 20 : 0;
  const depositMinor = Math.max(0, Math.round((total * depositPct) / 100));

  return {
    providerId: provider.id,
    providerUserId: provider.userId,
    businessName: provider.businessName,
    method,
    note: input.note,
    lines,
    subtotal,
    discountMinor,
    couponId,
    couponCode,
    total,
    depositMinor,
  };
}

/** How much to charge online now: the deposit for PARTIAL, the full total otherwise. */
function chargeForPlan(plan: OrderPlan): number {
  return plan.method === 'PARTIAL' ? Math.max(100, plan.depositMinor) : plan.total;
}

/**
 * Persists a validated plan as a real order: decrements stock, redeems the
 * coupon, clears the matching cart items, and notifies the store owner. Only
 * called once payment has actually settled (immediately for CASH/test mode,
 * or after a confirmed online payment) — never for a payment that might fail.
 */
async function finalizeOrderPlan(
  userId: string,
  plan: OrderPlan,
  payment: {
    amountPaidMinor: number;
    paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID';
    status: 'PENDING' | 'CONFIRMED';
    razorpayOrderId?: string;
    paymentRef?: string;
  },
) {
  const productIds = plan.lines.map((l) => l.productId);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId,
        providerId: plan.providerId,
        status: payment.status,
        note: plan.note,
        amountMinor: plan.total,
        discountMinor: plan.discountMinor,
        couponCode: plan.couponCode,
        amountPaidMinor: payment.amountPaidMinor,
        currency: 'INR',
        paymentMethod: plan.method,
        paymentStatus: payment.paymentStatus,
        razorpayOrderId: payment.razorpayOrderId,
        paymentRef: payment.paymentRef,
        items: {
          create: plan.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            measure: l.measure,
            priceMinor: l.priceMinor,
            priceQty: l.priceQty,
            unit: l.unit,
            quantity: l.quantity,
          })),
        },
      },
      include: orderInclude,
    });

    for (const l of plan.lines) {
      await tx.product.update({
        where: { id: l.productId },
        data: { stockQty: { decrement: l.quantity } },
      });
    }

    // The ordered items leave the cart.
    await tx.cartItem.deleteMany({ where: { userId, productId: { in: productIds } } });

    // Count the coupon redemption.
    if (plan.couponId) {
      await tx.coupon.update({
        where: { id: plan.couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    return created;
  });

  // Tell the store owner a new order came in.
  await notificationService.notify({
    userId: plan.providerUserId,
    type: 'ORDER_PLACED',
    title: 'New order',
    body: `You have a new order for ${formatINR(plan.total)}`,
    entityType: 'ORDER',
    entityId: order.id,
  });

  return order;
}

/**
 * Places a pickup order for a STORE business. CASH orders (and, in test mode
 * with no live Razorpay keys, ONLINE/PARTIAL) are placed immediately. With
 * live keys configured, ONLINE/PARTIAL must go through the payment endpoints
 * instead — the order is only created once that payment is confirmed, so a
 * failed or abandoned checkout never leaves a "placed" order or reserved stock
 * behind.
 */
async function create(userId: string, input: CreateOrderInput) {
  const plan = await buildOrderPlan(input);
  const configured = isRazorpayConfigured();

  if (configured && plan.method !== 'CASH') {
    throw ApiError.badRequest('Use the payment checkout to complete this order.');
  }

  let amountPaidMinor = 0;
  let paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' = 'PENDING';
  let status: 'PENDING' | 'CONFIRMED' = 'PENDING';
  if (!configured && plan.method === 'ONLINE') {
    amountPaidMinor = plan.total;
    paymentStatus = 'PAID';
    status = 'CONFIRMED';
  } else if (!configured && plan.method === 'PARTIAL') {
    amountPaidMinor = chargeForPlan(plan);
    paymentStatus = 'PARTIAL';
    status = 'CONFIRMED';
  }
  const simulated = !configured && (plan.method === 'ONLINE' || plan.method === 'PARTIAL');

  const order = await finalizeOrderPlan(userId, plan, { amountPaidMinor, paymentStatus, status });
  return { order, simulated };
}

/** The logged-in customer's orders (newest first). */
async function listMine(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
  });
}

/** Customer cancels their own order (while still cancellable); restores stock. */
async function cancelByCustomer(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, provider: { select: { userId: true } } },
  });
  if (!order || order.userId !== userId) throw ApiError.notFound('Order not found');
  if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
    throw ApiError.badRequest('This order can no longer be cancelled.');
  }

  // Any money already paid is refunded (simulated until Razorpay is live).
  const refund = order.paymentStatus === 'REFUNDED' ? 0 : Math.max(0, order.amountPaidMinor);

  await prisma.$transaction([
    ...restoreStockOps(order.items),
    prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', ...(refund > 0 ? { paymentStatus: 'REFUNDED' as const } : {}) },
    }),
  ]);

  // Let the store owner know the customer cancelled.
  await notificationService.notify({
    userId: order.provider.userId,
    type: 'ORDER_CANCELLED',
    title: 'Order cancelled',
    body:
      `A customer cancelled their ${formatINR(order.amountMinor)} order` +
      (refund > 0 ? ` — ${formatINR(refund)} refunded` : ''),
    entityType: 'ORDER',
    entityId: orderId,
  });

  // Confirm the refund to the customer.
  if (refund > 0) {
    await notificationService.notify({
      userId,
      type: 'ORDER_STATUS',
      title: 'Refund issued',
      body: `${formatINR(refund)} has been refunded for your cancelled order`,
      entityType: 'ORDER',
      entityId: orderId,
    });
  }

  return prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
}

// ── Provider side ────────────────────────────────────────────────────────────

/** All orders across every business owned by this provider (management view). */
async function listForOwner(userId: string) {
  return prisma.order.findMany({
    where: { provider: { userId } },
    orderBy: { createdAt: 'desc' },
    include: providerOrderInclude,
  });
}

/** Loads an order with items, enforcing provider ownership. */
async function getOwnedOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, provider: { select: { userId: true } } },
  });
  if (!order || order.provider.userId !== userId) throw ApiError.notFound('Order not found');
  return order;
}

/** Provider advances an order's status (confirm → ready → completed, or cancel). */
async function updateStatus(
  userId: string,
  orderId: string,
  status: OrderStatus,
  reason?: string,
) {
  const order = await getOwnedOrder(userId, orderId);
  if (!PROVIDER_ORDER_TRANSITIONS[order.status].includes(status)) {
    throw ApiError.badRequest(
      `A ${order.status.toLowerCase()} order can't be marked ${status.toLowerCase()}.`,
    );
  }
  // Cancelling a paid order refunds what was paid (simulated until Razorpay is live).
  const refund =
    status === 'CANCELLED' && order.paymentStatus !== 'REFUNDED'
      ? Math.max(0, order.amountPaidMinor)
      : 0;
  const cancelReason = status === 'CANCELLED' ? reason?.trim() || null : undefined;

  if (status === 'CANCELLED') {
    await prisma.$transaction([
      ...restoreStockOps(order.items),
      prisma.order.update({
        where: { id: orderId },
        data: {
          status,
          cancelReason,
          ...(refund > 0 ? { paymentStatus: 'REFUNDED' as const } : {}),
        },
      }),
    ]);
  } else {
    await prisma.order.update({ where: { id: orderId }, data: { status } });
  }

  // Keep the customer posted on their order (mention the refund / reason when cancelling).
  let body = ORDER_STATUS_COPY[status];
  if (status === 'CANCELLED') {
    body = refund > 0 ? `Your order was cancelled — ${formatINR(refund)} will be refunded` : body;
    if (cancelReason) body += `: ${cancelReason}`;
  }
  await notificationService.notify({
    userId: order.userId,
    type: 'ORDER_STATUS',
    title: 'Order update',
    body,
    entityType: 'ORDER',
    entityId: orderId,
  });

  return prisma.order.findUnique({ where: { id: orderId }, include: providerOrderInclude });
}

/** Provider records that a cash / unpaid order was paid in person. */
async function collectPayment(userId: string, orderId: string) {
  const order = await getOwnedOrder(userId, orderId);
  if (order.status === 'CANCELLED') throw ApiError.badRequest('This order was cancelled');
  if (order.paymentStatus === 'PAID' || order.amountPaidMinor >= order.amountMinor) {
    throw ApiError.badRequest('This order is already paid');
  }
  await prisma.order.update({
    where: { id: orderId },
    data: { amountPaidMinor: order.amountMinor, paymentStatus: 'PAID' },
  });
  return prisma.order.findUnique({ where: { id: orderId }, include: providerOrderInclude });
}

export const orderService = {
  create,
  listMine,
  cancelByCustomer,
  listForOwner,
  updateStatus,
  collectPayment,
  // Exposed for payment.service's pay-then-place checkout flow.
  buildOrderPlan,
  chargeForPlan,
  finalizeOrderPlan,
};

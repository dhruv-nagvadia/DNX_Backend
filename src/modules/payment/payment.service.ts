import crypto from 'crypto';
import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config';
import { ApiError } from '@/utils/ApiError';
import { isRazorpayConfigured, razorpay } from '@/lib/razorpay';
import { orderService, OrderPlan } from '@/modules/order/order.service';
import { CreateOrderInput } from '@/modules/order/order.types';

// How long a checkout's Razorpay order stays valid before the pending order
// (and the stock/coupon it holds a claim on) is considered abandoned.
const CHECKOUT_TTL_MS = 30 * 60 * 1000;

async function getOwnedBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { user: true, provider: { select: { businessName: true, depositPercent: true } } },
  });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  return booking;
}

type OwnedBooking = Awaited<ReturnType<typeof getOwnedBooking>>;

/** How much to charge online now: the deposit for PARTIAL, the full amount for ONLINE. */
function chargeFor(booking: OwnedBooking): number {
  const total = booking.amountMinor ?? 0;
  if (booking.paymentMethod === 'PARTIAL') {
    // Default to 20% when the provider hasn't configured a deposit.
    const pct = booking.provider.depositPercent || 20;
    return Math.max(100, Math.round((total * pct) / 100)); // at least ₹1
  }
  return total;
}

async function getPayableBooking(userId: string, bookingId: string) {
  const booking = await getOwnedBooking(userId, bookingId);
  if (booking.status === 'CANCELLED') throw ApiError.badRequest('This booking was cancelled');
  if (booking.paymentMethod === 'CASH') {
    throw ApiError.badRequest('This is a cash booking — pay at the venue.');
  }
  if (booking.paymentStatus === 'PAID' || booking.amountPaidMinor > 0) {
    throw ApiError.badRequest('This booking is already paid');
  }
  if (!booking.amountMinor) throw ApiError.badRequest('This booking has no amount to pay');
  return booking;
}

/** Records a payment (sets amount paid, derives PAID vs PARTIAL, auto-confirms). */
async function markPaid(bookingId: string, paidMinor: number, paymentRef: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  const total = booking.amountMinor ?? 0;
  const paymentStatus = total > 0 && paidMinor >= total ? 'PAID' : 'PARTIAL';
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      amountPaidMinor: paidMinor,
      paymentStatus,
      paymentRef,
      ...(booking.status === ('PENDING' as BookingStatus) ? { status: 'CONFIRMED' } : {}),
    },
  });
}

/**
 * Provider records that the outstanding balance was collected in person (cash).
 * Applies to CASH bookings (nothing paid online) and PARTIAL bookings (deposit
 * paid online, remainder due at the venue) — both become fully PAID.
 * Ownership is enforced by the provider controller before this runs.
 */
async function collectPayment(providerId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerId !== providerId) throw ApiError.notFound('Booking not found');
  if (booking.status === 'CANCELLED') throw ApiError.badRequest('This booking was cancelled');

  const total = booking.amountMinor ?? 0;
  if (total <= 0) throw ApiError.badRequest('This booking has no amount to collect');
  if (booking.paymentStatus === 'PAID' || booking.amountPaidMinor >= total) {
    throw ApiError.badRequest('This booking is already fully paid');
  }

  await markPaid(booking.id, total, `cash_${Date.now()}`);
  return { bookingId: booking.id, paymentStatus: 'PAID' as const, amountPaidMinor: total };
}

// ── Store orders ─────────────────────────────────────────────────────────────

async function getOwnedOrder(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: true, provider: { select: { businessName: true, depositPercent: true } } },
  });
  if (!order || order.userId !== userId) throw ApiError.notFound('Order not found');
  return order;
}

type OwnedOrder = Awaited<ReturnType<typeof getOwnedOrder>>;

/** How much to charge online now: the deposit for PARTIAL, the full amount for ONLINE. */
function chargeForOrder(order: OwnedOrder): number {
  const total = order.amountMinor ?? 0;
  if (order.paymentMethod === 'PARTIAL') {
    const pct = order.provider.depositPercent || 20;
    return Math.max(100, Math.round((total * pct) / 100)); // at least ₹1
  }
  return total;
}

async function getPayableOrder(userId: string, orderId: string) {
  const order = await getOwnedOrder(userId, orderId);
  if (order.status === 'CANCELLED') throw ApiError.badRequest('This order was cancelled');
  if (order.paymentMethod === 'CASH') {
    throw ApiError.badRequest('This is a cash order — pay at pickup.');
  }
  if (order.paymentStatus === 'PAID' || order.amountPaidMinor > 0) {
    throw ApiError.badRequest('This order is already paid');
  }
  if (!order.amountMinor) throw ApiError.badRequest('This order has no amount to pay');
  return order;
}

/** Records a payment on an order (sets amount paid, derives PAID vs PARTIAL, auto-confirms). */
async function markOrderPaid(orderId: string, paidMinor: number, paymentRef: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const total = order.amountMinor ?? 0;
  const paymentStatus = total > 0 && paidMinor >= total ? 'PAID' : 'PARTIAL';
  await prisma.order.update({
    where: { id: orderId },
    data: {
      amountPaidMinor: paidMinor,
      paymentStatus,
      paymentRef,
      ...(order.status === 'PENDING' ? { status: 'CONFIRMED' } : {}),
    },
  });
}

/**
 * Creates a Razorpay Order for the customer's native in-app checkout (or
 * signals test mode). The mobile app opens `RazorpayCheckout.open({ order_id })`
 * directly with this — no browser/payment-link redirect involved.
 */
async function createOrderPaymentOrder(userId: string, orderId: string) {
  const order = await getPayableOrder(userId, orderId);
  const amount = chargeForOrder(order);
  const currency = order.currency ?? 'INR';

  if (!isRazorpayConfigured()) {
    return { simulated: true as const, amount, currency };
  }

  const rzpOrder = await razorpay().orders.create({
    amount,
    currency,
    receipt: order.id,
    notes: { orderId: order.id },
  });

  await prisma.order.update({
    where: { id: order.id },
    data: { razorpayOrderId: String(rzpOrder.id) },
  });

  return {
    simulated: false as const,
    razorpayOrderId: String(rzpOrder.id),
    keyId: env.RAZORPAY_KEY_ID as string,
    amount,
    currency,
    name: order.provider.businessName,
    description: `Order at ${order.provider.businessName}`,
    email: order.user.email,
    contact: order.user.phone ?? undefined,
  };
}

/** Test-mode completion (only when live keys aren't set). */
async function simulateOrderPayment(userId: string, orderId: string) {
  if (isRazorpayConfigured()) {
    throw ApiError.badRequest('Live payments are enabled — complete the checkout instead.');
  }
  const order = await getPayableOrder(userId, orderId);
  const charge = chargeForOrder(order);
  await markOrderPaid(order.id, charge, `sim_${Date.now()}`);
  const total = order.amountMinor ?? 0;
  return { orderId: order.id, paymentStatus: charge >= total ? 'PAID' : 'PARTIAL' };
}

/** Verifies the signature the native SDK returns right after a successful charge. */
async function verifyOrderPayment(
  userId: string,
  orderId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const order = await getOwnedOrder(userId, orderId);
  if (order.paymentStatus === 'PAID') return { paymentStatus: order.paymentStatus };
  if (order.razorpayOrderId !== razorpayOrderId) {
    throw ApiError.badRequest('Payment does not match this order');
  }
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET as string)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (expected !== razorpaySignature) throw ApiError.unauthorized('Invalid payment signature');

  const charge = chargeForOrder(order);
  await markOrderPaid(order.id, charge, razorpayPaymentId);
  const total = order.amountMinor ?? 0;
  return { paymentStatus: charge >= total ? 'PAID' : ('PARTIAL' as const) };
}

/** Reconciliation fallback (e.g. app closed before the SDK's success callback ran). */
async function syncOrderPayment(userId: string, orderId: string) {
  const order = await getOwnedOrder(userId, orderId);
  if (order.paymentStatus !== 'PENDING') return { paymentStatus: order.paymentStatus };
  if (!isRazorpayConfigured() || !order.razorpayOrderId) {
    return { paymentStatus: order.paymentStatus };
  }

  const payments = (await razorpay().orders.fetchPayments(order.razorpayOrderId)) as unknown as {
    items?: Array<{ id: string; status: string; amount: number }>;
  };
  const captured = payments.items?.find((p) => p.status === 'captured' || p.status === 'authorized');
  if (captured) {
    await markOrderPaid(order.id, captured.amount, captured.id);
    return { paymentStatus: captured.amount >= (order.amountMinor ?? 0) ? 'PAID' : 'PARTIAL' };
  }
  return { paymentStatus: order.paymentStatus };
}

/**
 * Starts checkout for a NEW store order — validates the cart and (with live
 * keys) opens a Razorpay Order for it, but does not create the order yet. In
 * test mode (no live keys) there's no real payment to wait on, so the order
 * is placed immediately, exactly as before.
 */
async function startOrderCheckout(userId: string, input: CreateOrderInput) {
  const plan = await orderService.buildOrderPlan(input);
  if (plan.method === 'CASH') {
    throw ApiError.badRequest('Cash orders don’t need online payment.');
  }
  const charge = orderService.chargeForPlan(plan);
  const currency = 'INR';

  if (!isRazorpayConfigured()) {
    const paymentStatus = plan.method === 'PARTIAL' ? ('PARTIAL' as const) : ('PAID' as const);
    const order = await orderService.finalizeOrderPlan(userId, plan, {
      amountPaidMinor: charge,
      paymentStatus,
      status: 'CONFIRMED',
      paymentRef: `sim_${Date.now()}`,
    });
    return { simulated: true as const, orderId: order.id, amount: charge, currency };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized();

  const rzpOrder = await razorpay().orders.create({ amount: charge, currency });

  await prisma.pendingOrder.create({
    data: {
      userId,
      providerId: plan.providerId,
      razorpayOrderId: String(rzpOrder.id),
      payload: plan as unknown as Prisma.InputJsonValue,
      amountMinor: charge,
      currency,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    },
  });

  return {
    simulated: false as const,
    razorpayOrderId: String(rzpOrder.id),
    keyId: env.RAZORPAY_KEY_ID as string,
    amount: charge,
    currency,
    name: plan.businessName,
    description: `Order at ${plan.businessName}`,
    email: user.email,
    contact: user.phone ?? undefined,
  };
}

/**
 * Verifies the checkout signature and, only now, actually places the order —
 * decrementing stock and redeeming the coupon for the first time. A failed or
 * abandoned payment therefore never leaves a placed order behind.
 */
async function confirmOrderCheckout(
  userId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const pending = await prisma.pendingOrder.findUnique({ where: { razorpayOrderId } });
  if (!pending || pending.userId !== userId) {
    // Already finalized by the webhook racing us? Report that instead of erroring.
    const existing = await prisma.order.findFirst({ where: { razorpayOrderId, userId } });
    if (existing) return { paymentStatus: existing.paymentStatus, orderId: existing.id };
    throw ApiError.notFound('This payment session was not found or has expired');
  }

  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET as string)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (expected !== razorpaySignature) throw ApiError.unauthorized('Invalid payment signature');

  // Claim the pending order — if it's already gone, the webhook beat us to it.
  try {
    await prisma.pendingOrder.delete({ where: { id: pending.id } });
  } catch {
    const existing = await prisma.order.findFirst({ where: { razorpayOrderId, userId } });
    if (existing) return { paymentStatus: existing.paymentStatus, orderId: existing.id };
    throw ApiError.badRequest('This payment was already processed');
  }

  const plan = pending.payload as unknown as OrderPlan;
  const paymentStatus = plan.method === 'PARTIAL' && pending.amountMinor < plan.total ? 'PARTIAL' : 'PAID';
  const order = await orderService.finalizeOrderPlan(userId, plan, {
    amountPaidMinor: pending.amountMinor,
    paymentStatus,
    status: 'CONFIRMED',
    razorpayOrderId,
    paymentRef: razorpayPaymentId,
  });
  return { paymentStatus, orderId: order.id };
}

/**
 * Creates a Razorpay Order for the customer's native in-app checkout (or
 * signals test mode). The mobile app opens `RazorpayCheckout.open({ order_id })`
 * directly with this — no browser/payment-link redirect involved.
 */
async function createPaymentOrder(userId: string, bookingId: string) {
  const booking = await getPayableBooking(userId, bookingId);
  const amount = chargeFor(booking);
  const currency = booking.currency ?? 'INR';

  if (!isRazorpayConfigured()) {
    return { simulated: true as const, amount, currency };
  }

  const rzpOrder = await razorpay().orders.create({
    amount,
    currency,
    receipt: booking.id,
    notes: { bookingId: booking.id },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { razorpayOrderId: String(rzpOrder.id) },
  });

  return {
    simulated: false as const,
    razorpayOrderId: String(rzpOrder.id),
    keyId: env.RAZORPAY_KEY_ID as string,
    amount,
    currency,
    name: booking.provider.businessName,
    description: `Booking at ${booking.provider.businessName}`,
    email: booking.user.email,
    contact: booking.user.phone ?? undefined,
  };
}

/** Test-mode completion (only when live keys aren't set). */
async function simulatePayment(userId: string, bookingId: string) {
  if (isRazorpayConfigured()) {
    throw ApiError.badRequest('Live payments are enabled — complete the checkout instead.');
  }
  const booking = await getPayableBooking(userId, bookingId);
  const charge = chargeFor(booking);
  await markPaid(booking.id, charge, `sim_${Date.now()}`);
  const total = booking.amountMinor ?? 0;
  return { bookingId: booking.id, paymentStatus: charge >= total ? 'PAID' : 'PARTIAL' };
}

/** Verifies the signature the native SDK returns right after a successful charge. */
async function verifyPayment(
  userId: string,
  bookingId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const booking = await getOwnedBooking(userId, bookingId);
  if (booking.paymentStatus === 'PAID') return { paymentStatus: booking.paymentStatus };
  if (booking.razorpayOrderId !== razorpayOrderId) {
    throw ApiError.badRequest('Payment does not match this booking');
  }
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET as string)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  if (expected !== razorpaySignature) throw ApiError.unauthorized('Invalid payment signature');

  const charge = chargeFor(booking);
  await markPaid(booking.id, charge, razorpayPaymentId);
  const total = booking.amountMinor ?? 0;
  return { paymentStatus: charge >= total ? 'PAID' : ('PARTIAL' as const) };
}

/** Reconciliation fallback (e.g. app closed before the SDK's success callback ran). */
async function syncPayment(userId: string, bookingId: string) {
  const booking = await getOwnedBooking(userId, bookingId);
  if (booking.paymentStatus !== 'PENDING') return { paymentStatus: booking.paymentStatus };
  if (!isRazorpayConfigured() || !booking.razorpayOrderId) {
    return { paymentStatus: booking.paymentStatus };
  }

  const payments = (await razorpay().orders.fetchPayments(booking.razorpayOrderId)) as unknown as {
    items?: Array<{ id: string; status: string; amount: number }>;
  };
  const captured = payments.items?.find((p) => p.status === 'captured' || p.status === 'authorized');
  if (captured) {
    await markPaid(booking.id, captured.amount, captured.id);
    return { paymentStatus: captured.amount >= (booking.amountMinor ?? 0) ? 'PAID' : 'PARTIAL' };
  }
  return { paymentStatus: booking.paymentStatus };
}

/** Razorpay → server webhook. Secondary confirmation path for live payments. */
async function handleWebhook(rawBody: Buffer, signature?: string) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) throw ApiError.badRequest('Webhook not configured');

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected !== signature) throw ApiError.unauthorized('Invalid webhook signature');

  const event = JSON.parse(rawBody.toString());
  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    const paymentId: string = payment?.id ?? 'razorpay';
    const paid: number = payment?.amount ?? 0;
    const razorpayOrderId: string | undefined = payment?.order_id;
    if (!razorpayOrderId) return { received: true };

    // A cart checkout not yet confirmed by the client — place the order now
    // (idempotent: whichever of the webhook / client confirm call gets here
    // first wins the delete; the other finds nothing left to finalize).
    const pending = await prisma.pendingOrder.findUnique({ where: { razorpayOrderId } });
    if (pending) {
      try {
        await prisma.pendingOrder.delete({ where: { id: pending.id } });
      } catch {
        return { received: true }; // already claimed by the client's confirm call
      }
      const plan = pending.payload as unknown as OrderPlan;
      const paymentStatus = plan.method === 'PARTIAL' && paid < plan.total ? 'PARTIAL' : 'PAID';
      await orderService.finalizeOrderPlan(pending.userId, plan, {
        amountPaidMinor: paid,
        paymentStatus,
        status: 'CONFIRMED',
        razorpayOrderId,
        paymentRef: paymentId,
      });
      return { received: true };
    }

    const booking = await prisma.booking.findFirst({ where: { razorpayOrderId } });
    const order = booking ? null : await prisma.order.findFirst({ where: { razorpayOrderId } });
    if (booking && booking.paymentStatus === 'PENDING') {
      await markPaid(booking.id, paid, paymentId);
    } else if (order && order.paymentStatus === 'PENDING') {
      await markOrderPaid(order.id, paid, paymentId);
    }
  }
  return { received: true };
}

export const paymentService = {
  createPaymentOrder,
  simulatePayment,
  verifyPayment,
  syncPayment,
  createOrderPaymentOrder,
  simulateOrderPayment,
  verifyOrderPayment,
  syncOrderPayment,
  startOrderCheckout,
  confirmOrderCheckout,
  handleWebhook,
  collectPayment,
};

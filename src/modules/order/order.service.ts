import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { isRazorpayConfigured } from '@/lib/razorpay';
import { CreateOrderInput } from './order.types';

// What the customer app sees for each order.
const orderInclude = {
  items: true,
  provider: {
    select: { id: true, businessName: true, phone: true, category: { select: { slug: true, name: true } } },
  },
} satisfies Prisma.OrderInclude;

/**
 * Places a pickup order for a STORE business: validates stock, snapshots the
 * line items, decrements inventory, and settles payment. In test mode (no
 * Razorpay keys) an ONLINE order is marked paid immediately; CASH is collected
 * at pickup.
 */
async function create(userId: string, input: CreateOrderInput) {
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

  let total = 0;
  const lines = input.items.map((i) => {
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
    total += lineTotal;
    return {
      productId: p.id,
      name: p.name,
      measure: p.measure,
      priceMinor: p.priceMinor,
      priceQty: p.priceQty,
      unit: p.unit,
      quantity: amount,
    };
  });

  const method = input.paymentMethod ?? 'ONLINE';
  // Test mode: online payments settle instantly (no live keys to redirect to).
  const paidNow = method === 'ONLINE' && !isRazorpayConfigured();

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        userId,
        providerId: provider.id,
        status: paidNow ? 'CONFIRMED' : 'PENDING',
        note: input.note,
        amountMinor: total,
        amountPaidMinor: paidNow ? total : 0,
        currency: 'INR',
        paymentMethod: method,
        paymentStatus: paidNow ? 'PAID' : 'PENDING',
        items: {
          create: lines.map((l) => ({
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

    for (const l of lines) {
      await tx.product.update({
        where: { id: l.productId },
        data: { stockQty: { decrement: l.quantity } },
      });
    }

    return { order, simulated: paidNow };
  });
}

/** The logged-in customer's orders (newest first). */
async function listMine(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: orderInclude,
  });
}

export const orderService = { create, listMine };

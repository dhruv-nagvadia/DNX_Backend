import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const cartInclude = {
  product: {
    include: { provider: { select: { id: true, businessName: true } } },
  },
} satisfies Prisma.CartItemInclude;

type CartRow = Prisma.CartItemGetPayload<{ include: typeof cartInclude }>;

/** Shape the mobile cart consumes (base-unit quantity, clamped to stock). */
function toClientItem(row: CartRow) {
  const p = row.product;
  return {
    productId: p.id,
    providerId: p.provider.id,
    providerName: p.provider.businessName,
    name: p.name,
    measure: p.measure,
    priceMinor: p.priceMinor,
    priceQty: p.priceQty,
    currency: p.currency,
    unit: p.unit,
    stepQty: p.stepQty,
    stockQty: p.stockQty,
    imageUrl: p.imageUrl,
    quantity: Math.min(row.quantity, p.stockQty),
  };
}

/** The user's saved cart, hydrated with live product + store details. */
async function getCart(userId: string) {
  const rows = await prisma.cartItem.findMany({
    where: { userId, product: { isActive: true } },
    include: cartInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toClientItem);
}

/** Replace the whole cart with a validated set of items (last qty per product wins). */
async function replaceCart(userId: string, items: { productId: string; quantity: number }[]) {
  // De-dupe by productId (last wins).
  const wanted = new Map<string, number>();
  for (const i of items) {
    if (i.quantity > 0) wanted.set(i.productId, i.quantity);
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...wanted.keys()] }, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const rows = [...wanted.entries()]
    .filter(([id]) => byId.has(id))
    .map(([id, qty]) => ({
      userId,
      productId: id,
      quantity: Math.min(qty, byId.get(id)!.stockQty),
    }))
    .filter((r) => r.quantity > 0);

  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { userId } }),
    ...(rows.length ? [prisma.cartItem.createMany({ data: rows })] : []),
  ]);

  return getCart(userId);
}

/** Remove specific products from the cart (used after an order is placed). */
async function removeProducts(userId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  await prisma.cartItem.deleteMany({ where: { userId, productId: { in: productIds } } });
}

export const cartService = { getCart, replaceCart, removeProducts };

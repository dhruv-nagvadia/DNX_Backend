import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const cartInclude = {
  product: {
    include: {
      provider: {
        select: {
          id: true,
          businessName: true,
          depositPercent: true,
          codEnabled: true,
          partialPayEnabled: true,
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type CartRow = Prisma.CartItemGetPayload<{ include: typeof cartInclude }>;

/** unlimitedStock products reuse stockQty as a plain 0/1 availability flag
 * (see product.service's setStockStatus) — no real count to cap against, so
 * the quantity only zeroes out when currently marked out of stock. Tracked
 * products cap to the real count as before. */
function cappedQuantity(quantity: number, product: { stockQty: number; unlimitedStock: boolean }) {
  if (product.unlimitedStock) return product.stockQty > 0 ? quantity : 0;
  return Math.min(quantity, product.stockQty);
}

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
    unlimitedStock: p.unlimitedStock,
    imageUrl: p.imageUrl,
    depositPercent: p.provider.depositPercent,
    // Store's own flags AND this product's — never re-enabled by the
    // product if the store itself has opted out entirely.
    codEnabled: p.codEnabled && p.provider.codEnabled,
    partialPayEnabled: p.partialPayEnabled && p.provider.partialPayEnabled,
    quantity: cappedQuantity(row.quantity, p),
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
      quantity: cappedQuantity(qty, byId.get(id)!),
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

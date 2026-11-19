import { Prisma } from '@prisma/client';

/**
 * A business customers can see and book: it's active, hasn't been blocked by
 * an admin, and its owner's account hasn't been blocked or deleted either
 * (blocking or deleting the owner hides every business they run). One
 * definition so listings, search, detail pages, bookings and orders can't
 * drift apart on this rule.
 */
export const visibleToCustomers = {
  isActive: true,
  isBlocked: false,
  // A deleted account is deactivated (isActive: false), not removed.
  user: { isBlocked: false, isActive: true },
  // SERVICES-ONLY: product (STORE) businesses hidden from customers for launch (also blocks orders/bookings on them) — remove the next line to re-enable.
  type: 'SERVICE',
} satisfies Prisma.ProviderWhereInput;

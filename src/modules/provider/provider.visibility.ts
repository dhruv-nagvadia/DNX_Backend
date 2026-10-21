import { Prisma } from '@prisma/client';

/**
 * A business customers can see and book: it's active, hasn't been blocked by
 * an admin, and its owner's account hasn't been blocked either (blocking the
 * owner hides every business they run). One definition so listings, search,
 * detail pages, bookings and orders can't drift apart on this rule.
 */
export const visibleToCustomers = {
  isActive: true,
  isBlocked: false,
  user: { isBlocked: false },
} satisfies Prisma.ProviderWhereInput;

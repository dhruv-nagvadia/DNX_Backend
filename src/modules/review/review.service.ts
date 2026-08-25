import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';

interface CreateReviewInput {
  rating: number;
  comment?: string;
}

/** Recomputes a provider's ratingAvg/ratingCount from its reviews. */
async function syncProviderRating(providerId: string) {
  const agg = await prisma.review.aggregate({
    where: { providerId },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.provider.update({
    where: { id: providerId },
    data: {
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count,
    },
  });
}

/** Customer reviews a completed booking (one review per booking). */
async function create(userId: string, bookingId: string, input: CreateReviewInput) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'COMPLETED') {
    throw ApiError.badRequest('You can review a booking once it’s completed.');
  }

  const existing = await prisma.review.findUnique({ where: { bookingId } });
  if (existing) throw ApiError.conflict('You’ve already reviewed this booking.');

  const review = await prisma.review.create({
    data: {
      bookingId,
      userId,
      providerId: booking.providerId,
      rating: input.rating,
      comment: input.comment,
    },
  });

  await syncProviderRating(booking.providerId);
  return review;
}

/** Customer reviews a completed store order (one review per order). */
async function createForOrder(userId: string, orderId: string, input: CreateReviewInput) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== userId) throw ApiError.notFound('Order not found');
  if (order.status !== 'COMPLETED') {
    throw ApiError.badRequest('You can review an order once it’s completed.');
  }

  const existing = await prisma.review.findUnique({ where: { orderId } });
  if (existing) throw ApiError.conflict('You’ve already reviewed this order.');

  const review = await prisma.review.create({
    data: {
      orderId,
      userId,
      providerId: order.providerId,
      rating: input.rating,
      comment: input.comment,
    },
  });

  await syncProviderRating(order.providerId);
  return review;
}

/** Reviews for a provider (newest first) — public + owner dashboard. */
async function listForProvider(providerId: string) {
  return prisma.review.findMany({
    where: { providerId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
  });
}

// ── Per-product reviews ───────────────────────────────────────────────────────

/** Recomputes a product's ratingAvg/ratingCount from its reviews. */
async function syncProductRating(productId: string) {
  const agg = await prisma.productReview.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: true,
  });
  await prisma.product.update({
    where: { id: productId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count },
  });
}

/** Customer reviews a single product they bought in a completed order. */
async function createForProduct(
  userId: string,
  orderId: string,
  productId: string,
  input: CreateReviewInput,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.userId !== userId) throw ApiError.notFound('Order not found');
  if (order.status !== 'COMPLETED') {
    throw ApiError.badRequest('You can review products once the order is completed.');
  }
  if (!order.items.some((i) => i.productId === productId)) {
    throw ApiError.badRequest('That product is not part of this order.');
  }

  const existing = await prisma.productReview.findUnique({
    where: { orderId_productId: { orderId, productId } },
  });
  if (existing) throw ApiError.conflict('You’ve already reviewed this product for this order.');

  const review = await prisma.productReview.create({
    data: { orderId, productId, userId, rating: input.rating, comment: input.comment },
  });

  await syncProductRating(productId);
  return review;
}

/** Public list of a product's reviews (newest first). */
async function listForProduct(productId: string) {
  return prisma.productReview.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { fullName: true } },
    },
  });
}

export const reviewService = {
  create,
  createForOrder,
  createForProduct,
  listForProvider,
  listForProduct,
};

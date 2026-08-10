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

export const reviewService = { create, listForProvider };

import { Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';

/**
 * Bookings module — Phase 1 skeleton.
 *
 * Follow the same pattern as `auth` and `provider` when fleshing this out:
 *   booking.types.ts  -> input/output shapes
 *   booking.validation.ts -> zod schemas
 *   booking.service.ts -> business logic (slot availability, double-booking
 *                          prevention via the @@unique([providerId, startTime])
 *                          constraint, wrapped in prisma.$transaction)
 *   booking.controller.ts -> thin controllers
 *   booking.routes.ts -> wiring (this file)
 *
 * Phase 2 adds: payment capture, calendar sync, reminders.
 */
export const bookingRoutes = Router();

// Placeholder so the route is mounted and testable end-to-end.
bookingRoutes.get(
  '/mine',
  requireAuth,
  asyncHandler(async (_req, res) => {
    sendSuccess(res, [], 'Bookings endpoint scaffolded — implement in booking.service.ts');
  }),
);

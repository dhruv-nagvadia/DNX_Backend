import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ApiError } from '@/utils/ApiError';
import { logger } from '@/utils/logger';
import { isProd } from '@/config';

/**
 * Global error handler — the LAST middleware mounted on the app.
 * Normalizes every error type into the standard failure envelope:
 *   { success: false, message, details? }
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Known operational error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  // Validation error from zod
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      details: err.flatten().fieldErrors,
    });
  }

  // Bad request bodies rejected by express.json / urlencoded (they carry a `type`
  // and an HTTP status) — without this a malformed body would show up as a 500.
  const bodyErr = err as { type?: string; status?: number };
  if (bodyErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
  }
  if (bodyErr?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }

  // File-upload errors from multer (size limit, unexpected field, ...).
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (max 10 MB)'
        : err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Unexpected file field in upload'
          : 'Upload failed';
    return res.status(400).json({ success: false, message });
  }

  // Prisma unique-constraint violation, etc.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'A record with these details already exists',
        details: err.meta,
      });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        success: false,
        message: 'This record is linked to other data and cannot be changed or removed',
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
  }

  // Unknown / programming error
  logger.error('Unhandled error', err);
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(isProd ? {} : { details: err instanceof Error ? err.message : String(err) }),
  });
}

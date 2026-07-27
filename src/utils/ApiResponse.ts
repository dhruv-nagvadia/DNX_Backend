import { Response } from 'express';

/**
 * Standard success envelope so every endpoint returns the same shape:
 *   { success: true, message, data }
 * The frontend/mobile API layer can rely on this contract everywhere.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

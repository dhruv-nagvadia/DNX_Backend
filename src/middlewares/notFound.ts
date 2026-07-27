import { Request, Response } from 'express';

/** Catches any request that didn't match a route. */
export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

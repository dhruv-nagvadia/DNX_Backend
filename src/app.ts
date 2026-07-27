import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env, isDev } from '@/config';
import { apiRouter } from '@/routes';
import { notFound } from '@/middlewares/notFound';
import { errorHandler } from '@/middlewares/errorHandler';
import { UPLOAD_DIR } from '@/middlewares/upload';

export function createApp(): Application {
  const app = express();

  // Security & parsing
  app.use(
    helmet({
      // Allow the web/mobile clients to load uploaded images from a different origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  if (isDev) app.use(morgan('dev'));

  // Serve uploaded business images.
  app.use('/uploads', express.static(UPLOAD_DIR));

  // Health check (used by load balancers / uptime monitors)
  app.get('/health', (_req, res) => res.json({ success: true, message: 'ok' }));

  // All versioned API routes
  app.use('/api/v1', apiRouter);

  // 404 + centralized error handling (must be last)
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

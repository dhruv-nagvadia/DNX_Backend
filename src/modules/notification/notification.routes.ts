import { Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { notificationController } from './notification.controller';

/**
 * In-app notifications, shared by both apps (provider web + customer mobile).
 * Mounted at /notifications — any authenticated user, regardless of role, sees
 * only their own notifications.
 */
export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);

notificationRoutes.get('/', notificationController.list);
notificationRoutes.get('/unread-count', notificationController.unreadCount);
notificationRoutes.patch('/read-all', notificationController.markAllRead);
notificationRoutes.patch('/:id/read', notificationController.markRead);

import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { reminderController } from './reminder.controller';
import { createReminderSchema, updateReminderSchema } from './reminder.validation';

/** Customer reminders. Mounted at /customer/reminders — USER only. */
export const reminderRoutes = Router();
reminderRoutes.use(requireAuth, requireRole(Role.USER));

reminderRoutes.get('/', reminderController.list);
reminderRoutes.post('/', validate(createReminderSchema), reminderController.create);
reminderRoutes.patch('/:id', validate(updateReminderSchema), reminderController.update);
reminderRoutes.patch('/:id/done', reminderController.markDone);
reminderRoutes.delete('/:id', reminderController.remove);

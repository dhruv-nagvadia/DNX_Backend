import { Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { deviceController } from './device.controller';
import { registerDeviceSchema, unregisterDeviceSchema } from './device.validation';

/**
 * Push-notification (FCM) device tokens, shared by both mobile apps. Mounted
 * at /devices — any authenticated role; a user only ever touches their own.
 *   POST   /devices  { token, platform: 'ios'|'android', app: 'customer'|'provider' }
 *   DELETE /devices  { token }
 */
export const deviceRoutes = Router();
deviceRoutes.use(requireAuth);

deviceRoutes.post('/', validate(registerDeviceSchema), deviceController.register);
deviceRoutes.delete('/', validate(unregisterDeviceSchema), deviceController.unregister);

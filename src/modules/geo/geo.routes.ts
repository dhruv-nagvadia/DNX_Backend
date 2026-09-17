import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { geoController } from './geo.controller';
import { reverseGeocodeSchema } from './geo.validation';

export const geoRoutes = Router();

// Public: no PII, just a geocoding proxy (avoids Nominatim's missing CORS headers).
geoRoutes.get('/reverse', validate(reverseGeocodeSchema), geoController.reverseGeocode);

import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { geoService } from './geo.service';
import { ReverseGeocodeQuery } from './geo.types';

const reverseGeocode = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng } = req.query as unknown as ReverseGeocodeQuery;
  const result = await geoService.reverseGeocode(lat, lng);
  sendSuccess(res, result);
});

export const geoController = { reverseGeocode };

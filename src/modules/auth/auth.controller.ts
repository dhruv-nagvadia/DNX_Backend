import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { authService } from './auth.service';

/**
 * Controllers are thin: they read validated input, call the service,
 * and shape the response. The register/login role comes from the route
 * (customer vs provider), never from the request body.
 */
const registerCustomer = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body, Role.USER);
  sendSuccess(res, result, 'Registered successfully', 201);
});

const loginCustomer = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, Role.USER);
  sendSuccess(res, result, 'Logged in successfully');
});

const registerProvider = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body, Role.PROVIDER);
  sendSuccess(res, result, 'Registered successfully', 201);
});

const loginProvider = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, Role.PROVIDER);
  sendSuccess(res, result, 'Logged in successfully');
});

const refresh = asyncHandler(async (req: Request, res: Response) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  sendSuccess(res, tokens, 'Token refreshed');
});

const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.me(req.user.sub);
  sendSuccess(res, user);
});

export const authController = {
  registerCustomer,
  loginCustomer,
  registerProvider,
  loginProvider,
  refresh,
  me,
};

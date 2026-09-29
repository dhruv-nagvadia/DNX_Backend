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

const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.updateMe(req.user.sub, req.body);
  sendSuccess(res, user, 'Profile updated');
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await authService.changePassword(req.user.sub, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, null, 'Password updated');
});

// "Always succeeds" response regardless of whether the email is registered —
// the service already no-ops silently for an unknown/inactive account, so
// the controller never has anything account-specific to branch on here.
const requestPasswordResetCustomer = asyncHandler(async (req: Request, res: Response) => {
  await authService.requestPasswordReset(req.body.email, Role.USER);
  sendSuccess(res, null, 'If that email is registered, a reset code has been sent');
});

const resetPasswordCustomer = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.email, Role.USER, req.body.otp, req.body.newPassword);
  sendSuccess(res, null, 'Password reset');
});

const requestPasswordResetProvider = asyncHandler(async (req: Request, res: Response) => {
  await authService.requestPasswordReset(req.body.email, Role.PROVIDER);
  sendSuccess(res, null, 'If that email is registered, a reset code has been sent');
});

const resetPasswordProvider = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.email, Role.PROVIDER, req.body.otp, req.body.newPassword);
  sendSuccess(res, null, 'Password reset');
});

const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await authService.deleteAccount(req.user.sub, req.body.password);
  sendSuccess(res, null, 'Account deleted');
});

export const authController = {
  registerCustomer,
  loginCustomer,
  registerProvider,
  loginProvider,
  refresh,
  me,
  updateMe,
  changePassword,
  requestPasswordResetCustomer,
  resetPasswordCustomer,
  requestPasswordResetProvider,
  resetPasswordProvider,
  deleteAccount,
};

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config';
import { sendEmail } from '@/lib/email';
import { ApiError } from '@/utils/ApiError';
import { AuthResult, AuthTokens, LoginInput, RegisterInput } from './auth.types';
import { AuthPayload } from '@/middlewares/auth.middleware';

const SALT_ROUNDS = 10;
const OTP_EXPIRY_MIN = 10;
const MAX_OTP_ATTEMPTS = 5;

function signTokens(payload: AuthPayload): AuthTokens {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
  return { accessToken, refreshToken };
}

async function register(input: RegisterInput, role: Role): Promise<AuthResult> {
  // Uniqueness is per (email, role): the same email can be a customer AND a
  // provider as two independent accounts.
  const existing = await prisma.user.findUnique({
    where: { email_role: { email: input.email, role } },
  });
  if (existing) {
    throw ApiError.conflict(
      role === Role.PROVIDER
        ? 'A business account with this email already exists'
        : 'An account with this email already exists',
    );
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      postalCode: input.postalCode,
      city: input.city,
      state: input.state,
      role,
    },
  });

  const tokens = signTokens({ sub: user.id, role: user.role });
  return {
    ...tokens,
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    postalCode: user.postalCode,
    city: user.city,
    state: user.state,
  };
}

async function login(input: LoginInput, role: Role): Promise<AuthResult> {
  // Scoped to the audience: a customer login only matches USER accounts, a
  // provider login only matches PROVIDER accounts.
  const user = await prisma.user.findUnique({
    where: { email_role: { email: input.email, role } },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid credentials');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');

  const tokens = signTokens({ sub: user.id, role: user.role });
  return {
    ...tokens,
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    postalCode: user.postalCode,
    city: user.city,
    state: user.state,
  };
}

async function refresh(refreshToken: string): Promise<AuthTokens> {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as AuthPayload;
    return signTokens({ sub: decoded.sub, role: decoded.role });
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
}

async function me(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      phone: true,
      avatarUrl: true,
      postalCode: true,
      city: true,
      state: true,
    },
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/** Updates the signed-in account's own profile fields. */
async function updateMe(
  userId: string,
  input: {
    fullName?: string;
    phone?: string;
    email?: string;
    postalCode?: string;
    city?: string;
    state?: string;
  },
) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        postalCode: input.postalCode,
        city: input.city,
        state: input.state,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        avatarUrl: true,
        postalCode: true,
        city: true,
        state: true,
      },
    });
  } catch (err) {
    // @@unique([email, role]) — the email is taken by another account of this type.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('That email is already in use');
    }
    throw err;
  }
}

/** Changes the signed-in account's password after verifying the current one. */
async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

const otpEmailHtml = (otp: string) => `
  <p>Your DNX verification code is:</p>
  <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
  <p>This code expires in ${OTP_EXPIRY_MIN} minutes. If you didn't request this, you can ignore this email.</p>
`;

/**
 * Emails a one-time reset code. Always resolves the same way whether or not
 * the account exists (nothing to check on the caller side), so this can't be
 * used to discover which emails are registered.
 */
async function requestPasswordReset(email: string, role: Role): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email_role: { email, role } } });
  if (!user || !user.isActive) return;

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const resetOtpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetOtpHash,
      resetOtpExpiresAt: new Date(Date.now() + OTP_EXPIRY_MIN * 60_000),
      resetOtpAttempts: 0,
    },
  });

  await sendEmail(user.email, 'Your DNX password reset code', otpEmailHtml(otp), otp);
}

/** Verifies the emailed code and sets a new password. */
async function resetPassword(
  email: string,
  role: Role,
  otp: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email_role: { email, role } } });
  if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
    throw ApiError.badRequest('Invalid or expired code');
  }
  if (user.resetOtpExpiresAt < new Date()) {
    throw ApiError.badRequest('This code has expired. Request a new one.');
  }
  if (user.resetOtpAttempts >= MAX_OTP_ATTEMPTS) {
    throw ApiError.badRequest('Too many attempts. Request a new code.');
  }

  const ok = await bcrypt.compare(otp, user.resetOtpHash);
  if (!ok) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtpAttempts: { increment: 1 } },
    });
    throw ApiError.badRequest('Incorrect code');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetOtpHash: null, resetOtpExpiresAt: null, resetOtpAttempts: 0 },
  });
}

/**
 * Deletes the signed-in account. Hard-deleting is unsafe — bookings, orders
 * and reviews reference the user without cascading (kept deliberately, as
 * business/accounting history), so a raw delete would fail with a foreign-key
 * error for any user who's ever booked or ordered something. Soft-delete
 * instead: deactivate and scrub personal fields, freeing the email (the
 * @@unique([email, role]) constraint still applies to this now-inactive row)
 * so the person can register again later if they choose to.
 */
async function deleteAccount(userId: string, password: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound('User not found');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Incorrect password');

  const scrambledPasswordHash = await bcrypt.hash(crypto.randomUUID(), SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      email: `deleted-${user.id}@dnx.invalid`,
      phone: null,
      fullName: 'Deleted user',
      avatarUrl: null,
      passwordHash: scrambledPasswordHash,
      resetOtpHash: null,
      resetOtpExpiresAt: null,
      resetOtpAttempts: 0,
    },
  });
}

export const authService = {
  register,
  login,
  refresh,
  me,
  updateMe,
  changePassword,
  requestPasswordReset,
  resetPassword,
  deleteAccount,
};

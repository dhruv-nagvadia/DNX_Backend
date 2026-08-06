import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config';
import { ApiError } from '@/utils/ApiError';
import { AuthResult, AuthTokens, LoginInput, RegisterInput } from './auth.types';
import { AuthPayload } from '@/middlewares/auth.middleware';

const SALT_ROUNDS = 10;

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
    select: { id: true, email: true, fullName: true, role: true, phone: true, avatarUrl: true },
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

export const authService = { register, login, refresh, me };

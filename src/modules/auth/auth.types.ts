import { Role } from '@prisma/client';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role?: Role;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Flat auth payload so clients get id/email/fullName/role alongside the tokens.
export interface AuthResult extends AuthTokens {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

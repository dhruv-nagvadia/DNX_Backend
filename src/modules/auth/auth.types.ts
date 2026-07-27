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

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: Role;
  };
}

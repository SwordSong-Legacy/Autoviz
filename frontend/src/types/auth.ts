/**
 * Authentication types.
 * Aligned with backend schemas: UserRead, Token, UserCreate.
 */

export interface User {
  id: string;
  email: string;
  username?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Backend returns Token only (access_token, token_type). User is fetched via /auth/me. */
export interface LoginTokenResponse {
  access_token: string;
  token_type: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

/** Backend UserRead: id, email, username, is_active, created_at, updated_at */
export interface RegisterResponse {
  id: string;
  email: string;
  username?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Application constants.
 */

export const APP_NAME = "Autoviz";
export const APP_DESCRIPTION = "AI-powered data visualization and insight platform";

// API Routes (Next.js internal routes)
export const API_ROUTES = {
  // Auth
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
  REFRESH: "/auth/refresh",
  ME: "/auth/me",

  // Health
  HEALTH: "/health",

  // Users
  USERS: "/users",

  // Chat (AI Agent)
  CHAT: "/chat",
} as const;

// Navigation routes
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  CHAT: "/chat",
  PROFILE: "/profile",
  SETTINGS: "/settings",
} as const;

// WebSocket URL (for chat - this needs to be direct to backend for WS)
// Priority: NEXT_PUBLIC_WS_URL env var > NODE_ENV fallback
const resolveWsUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (typeof envUrl === "string" && envUrl.length > 0) return envUrl.replace(/\/$/, "");
  return process.env.NODE_ENV === "production"
    ? "wss://fyp4502-backend-137393663085.asia-east1.run.app"
    : "ws://localhost:8000";
};
export const WS_URL = resolveWsUrl();

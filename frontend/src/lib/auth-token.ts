/**
 * Auth token storage for API client.
 * Used when calling backend directly (e.g. static export) where cookies aren't sent cross-origin.
 * Persists to localStorage so it survives page refresh.
 */

const STORAGE_KEY = "autoviz-auth-token";

function getStored(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

let token: string | null = getStored();

export function getAuthToken(): string | null {
  return token ?? getStored();
}

export function setAuthToken(t: string | null): void {
  token = t;
  if (typeof window !== "undefined") {
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
  }
}

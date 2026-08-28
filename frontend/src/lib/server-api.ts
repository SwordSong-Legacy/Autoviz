/**
 * Server-side API client for calling the FastAPI backend.
 * This module is used by Next.js API routes to proxy requests.
 * IMPORTANT: This file should only be imported in server-side code (API routes, Server Components).
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export class BackendApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`Backend API error: ${status} ${statusText}`);
    this.name = "BackendApiError";
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

/**
 * Make a request to the FastAPI backend.
 * This should only be called from Next.js API routes or Server Components.
 */
export async function backendFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options;

  let url = `${BACKEND_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    throw new BackendApiError(response.status, response.statusText, errorData);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return null as T;
  }

  return JSON.parse(text);
}

/**
 * Forward authorization header from the incoming request to the backend.
 */
export function getAuthHeaders(authHeader: string | null): Record<string, string> {
  if (!authHeader) {
    return {};
  }
  return { Authorization: authHeader };
}

/**
 * Extract user-friendly error message from BackendApiError (handles Pydantic validation format).
 */
export function extractBackendErrorDetail(error: BackendApiError, fallback: string): string {
  const data = error.data;
  if (typeof data === "object" && data !== null) {
    const detail = (data as { detail?: string | unknown })?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msg = detail
        .map((e: { msg?: string }) => e?.msg)
        .filter(Boolean)
        .join("; ");
      if (msg) return msg;
    }
  }
  return fallback;
}

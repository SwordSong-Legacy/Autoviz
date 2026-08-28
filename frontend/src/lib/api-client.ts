/**
 * Client-side API client.
 * Priority: NEXT_PUBLIC_BACKEND_URL env var > NODE_ENV fallback
 *   - production build without explicit env: Cloud Run URL
 *   - development build without explicit env: localhost:8000
 * When NEXT_PUBLIC_USE_API_PROXY is "true", uses /api/v1 (Next.js proxy) for same-origin auth.
 */

import { getAuthToken } from "./auth-token";

const PRODUCTION_BACKEND = "https://fyp4502-backend-137393663085.asia-east1.run.app";
const DEVELOPMENT_BACKEND = "http://localhost:8000";

const resolveApiBase = (): string => {
  if (process.env.NEXT_PUBLIC_USE_API_PROXY === "true") {
    return "/api/v1";
  }
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof envUrl === "string" && envUrl.length > 0) {
    return `${envUrl.replace(/\/$/, "")}/api/v1`;
  }
  if (process.env.NODE_ENV === "production") {
    return `${PRODUCTION_BACKEND}/api/v1`;
  }
  return `${DEVELOPMENT_BACKEND}/api/v1`;
};

const API_BASE = resolveApiBase();

/** True when calling backend directly (e.g. Firebase static export) */
export const isDirectBackend = API_BASE.startsWith("http");

/**
 * Resolve image URL for visualization.
 * - When using API proxy (same-origin): returns /api/v1/... so cookies work.
 * - When calling backend directly (Firebase static): returns full backend URL with
 *   ?token= so <img> can load (img cannot send Authorization header).
 */
export function getImageUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http")) return path;
  const normalized = path.startsWith("/api/")
    ? path
    : path.startsWith("/")
      ? `/api/v1${path}`
      : `/api/v1/${path}`;

  if (isDirectBackend) {
    const token = getAuthToken();
    const base = API_BASE.replace(/\/api\/v1\/?$/, "");
    const fullUrl = `${base}${normalized}`;
    return token ? `${fullUrl}?token=${encodeURIComponent(token)}` : fullUrl;
  }

  return normalized;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  params?: Record<string, string>;
  body?: unknown;
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestOptions & { formData?: Record<string, string> } = {}
  ): Promise<T> {
    const { params, body, formData, ...fetchOptions } = options;

    let url = `${API_BASE}${endpoint}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const isForm = !!formData;
    const requestBody = isForm
      ? new URLSearchParams(formData).toString()
      : body
        ? JSON.stringify(body)
        : undefined;
    const contentType = isForm ? "application/x-www-form-urlencoded" : "application/json";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      ...(fetchOptions.headers as Record<string, string>),
    };

    // Add Bearer token when calling backend directly (cookies don't work cross-origin)
    const authToken = getAuthToken();
    if (authToken && isDirectBackend) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      credentials: API_BASE.startsWith("/") ? "same-origin" : "include",
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }
      if (response.status === 401 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
      }
      throw new ApiError(
        response.status,
        errorData?.detail || errorData?.message || "Request failed",
        errorData
      );
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) {
      return null as T;
    }

    return JSON.parse(text);
  }

  get<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  /** GET binary response (e.g. PDF, DOCX). Returns Blob for file download. */
  async getBlob(endpoint: string, params?: Record<string, string>): Promise<Blob> {
    let url = `${API_BASE}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    const headers: Record<string, string> = {};
    const authToken = getAuthToken();
    if (authToken && isDirectBackend) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const response = await fetch(url, {
      method: "GET",
      credentials: API_BASE.startsWith("/") ? "same-origin" : "include",
      headers,
    });
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }
      throw new ApiError(
        response.status,
        (errorData as { detail?: string })?.detail ||
          (errorData as { message?: string })?.message ||
          "Request failed",
        errorData
      );
    }
    return response.blob();
  }

  post<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: "POST", body });
  }

  /** POST with form-urlencoded body (for OAuth2 login when calling backend directly) */
  postForm<T>(endpoint: string, formData: Record<string, string>, options?: RequestOptions) {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      formData,
    });
  }

  /** POST with multipart/form-data (for file uploads). Do not set Content-Type; browser sets it with boundary. */
  async postMultipart<T>(
    endpoint: string,
    formData: FormData,
    options?: Omit<RequestOptions, "body">
  ): Promise<T> {
    let url = `${API_BASE}${endpoint}`;
    const { params, ...fetchOptions } = options ?? {};
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const headers: Record<string, string> = {
      ...(fetchOptions.headers as Record<string, string>),
    };
    const authToken = getAuthToken();
    if (authToken && isDirectBackend) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      method: "POST",
      credentials: API_BASE.startsWith("/") ? "same-origin" : "include",
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }
      throw new ApiError(
        response.status,
        errorData?.detail || errorData?.message || "Request failed",
        errorData
      );
    }

    const text = await response.text();
    if (!text) return null as T;
    return JSON.parse(text);
  }

  put<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: "PUT", body });
  }

  patch<T>(endpoint: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body });
  }

  delete<T>(endpoint: string, options?: RequestOptions) {
    return this.request<T>(endpoint, { ...options, method: "DELETE" });
  }

  /**
   * POST with Server-Sent Events stream.
   * Calls onEvent(eventType, data) for each SSE event. Rejects on HTTP error or viz_error.
   * @param body - Optional JSON body to send with the request
   */
  async postSSE(
    endpoint: string,
    onEvent: (eventType: string, data: unknown) => void | Promise<void>,
    body?: Record<string, unknown>
  ): Promise<void> {
    const url = `${API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    const authToken = getAuthToken();
    if (authToken && isDirectBackend) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      credentials: API_BASE.startsWith("/") ? "same-origin" : "include",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }
      throw new ApiError(
        response.status,
        (errorData as { detail?: string })?.detail ||
          (errorData as { message?: string })?.message ||
          "Request failed",
        errorData
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new ApiError(500, "No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData = line.slice(5);
        } else if (line === "") {
          if (currentData !== "") {
            const eventType = currentEvent || "message";
            let parsed: unknown;
            try {
              parsed = JSON.parse(currentData);
            } catch {
              parsed = currentData;
            }
            await onEvent(eventType, parsed);
            if (eventType === "viz_error") {
              throw new ApiError(
                500,
                (parsed as { message?: string })?.message || "Visualization failed"
              );
            }
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  }
}

export const apiClient = new ApiClient();

"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores";
import { apiClient, ApiError, isDirectBackend } from "@/lib/api-client";
import { setAuthToken } from "@/lib/auth-token";
import type { User, LoginRequest, RegisterRequest } from "@/types";
import { ROUTES } from "@/lib/constants";

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, setLoading, logout } = useAuthStore();

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await apiClient.get<User>("/auth/me");
        setUser(userData);
      } catch {
        setUser(null);
      }
    };

    if (isLoading) {
      checkAuth();
    }
  }, [isLoading, setUser]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      setLoading(true);
      try {
        let userData: User;
        if (isDirectBackend) {
          // Direct backend: send OAuth2 form, get token, store in localStorage
          const response = await apiClient.postForm<{ access_token: string }>("/auth/login", {
            username: credentials.email,
            password: credentials.password,
          });
          setAuthToken(response.access_token);
          userData = await apiClient.get<User>("/auth/me", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
        } else {
          // Proxy: use Next.js route - accepts JSON, sets httpOnly cookie
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(credentials),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new ApiError(
              res.status,
              (err as { detail?: string })?.detail ?? "Login failed",
              err
            );
          }
          const data = (await res.json()) as { user: User; message: string };
          userData = data.user;
        }
        setUser(userData);
        router.push(ROUTES.CHAT);
        return { user: userData, message: "Login successful" };
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [router, setUser, setLoading, isDirectBackend]
  );

  const register = useCallback(async (data: RegisterRequest) => {
    const response = await apiClient.post<{ id: string; email: string }>("/auth/register", data);
    return response;
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Ignore logout errors
    } finally {
      setAuthToken(null);
      logout();
      router.push(ROUTES.LOGIN);
    }
  }, [logout, router]);

  const refreshToken = useCallback(async () => {
    try {
      await apiClient.post("/auth/refresh");
      // Re-fetch user after token refresh
      const userData = await apiClient.get<User>("/auth/me");
      setUser(userData);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        logout();
        router.push(ROUTES.LOGIN);
      }
      return false;
    }
  }, [logout, router, setUser]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout: handleLogout,
    refreshToken,
  };
}

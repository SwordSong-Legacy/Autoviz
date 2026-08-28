import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError, extractBackendErrorDetail } from "@/lib/server-api";
import type { LoginTokenResponse, User } from "@/types";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { detail: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Backend expects OAuth2 form data format
    const formData = new URLSearchParams();
    formData.append("username", body.email ?? "");
    formData.append("password", body.password);

    const tokenData = await backendFetch<LoginTokenResponse>("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    // Fetch user with new token (backend login returns Token only)
    const user = await backendFetch<User>("/api/v1/auth/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const response = NextResponse.json({
      user,
      message: "Login successful",
    });

    // Set access token cookie — lifetime matches the JWT (7 days)
    response.cookies.set("access_token", tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    if (error instanceof BackendApiError) {
      const detail = extractBackendErrorDetail(error, "Login failed");
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

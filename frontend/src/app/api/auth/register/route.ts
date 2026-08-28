import { NextRequest, NextResponse } from "next/server";
import { backendFetch, BackendApiError, extractBackendErrorDetail } from "@/lib/server-api";
import type { RegisterResponse } from "@/types";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!body.password || body.password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { detail: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Backend UserCreate expects: email, username (optional), password
    const payload = {
      email: body.email,
      username: body.name?.trim() || null,
      password: body.password,
    };

    const data = await backendFetch<RegisterResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    if (error instanceof BackendApiError) {
      const detail = extractBackendErrorDetail(error, "Registration failed");
      return NextResponse.json({ detail }, { status: error.status });
    }
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

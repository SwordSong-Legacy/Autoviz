/**
 * Proxy route: forwards /api/v1/* to the backend with auth cookie.
 * Use when NEXT_PUBLIC_USE_API_PROXY=true (e.g. next dev) for same-origin auth.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export const dynamic = "force-dynamic";

async function proxyRequest(request: NextRequest, path: string[]) {
  const pathStr = path.join("/");
  const url = new URL(`/api/v1/${pathStr}`, BACKEND_URL);
  url.search = request.nextUrl.search;

  const accessToken = request.cookies.get("access_token")?.value;
  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") || "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Use arrayBuffer for body to preserve multipart/form-data (file uploads)
  const body =
    request.method !== "GET" && request.method !== "HEAD" ? await request.arrayBuffer() : undefined;

  const response = await fetch(url.toString(), {
    method: request.method,
    headers,
    body,
  });

  // 204 No Content / 304 Not Modified 不能有 body
  const status = response.status;
  if (status === 204 || status === 304) {
    return new NextResponse(null, { status, statusText: response.statusText });
  }

  const contentType = response.headers.get("content-type") || "application/json";
  const isBinary = contentType.startsWith("image/") || contentType.includes("octet-stream");
  const data = isBinary ? await response.arrayBuffer() : await response.text();
  return new NextResponse(data ?? null, {
    status,
    statusText: response.statusText,
    headers: { "Content-Type": contentType },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path);
}

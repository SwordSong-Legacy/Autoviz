import { NextResponse } from "next/server";

// Conversations API route - not configured (enable_conversation_persistence is false)

export async function GET() {
  return NextResponse.json({ detail: "Not configured" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ detail: "Not configured" }, { status: 501 });
}

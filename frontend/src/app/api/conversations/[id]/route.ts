import { NextResponse } from "next/server";

// Conversation detail API route - not configured (enable_conversation_persistence is false)

export async function GET() {
  return NextResponse.json({ detail: "Not configured" }, { status: 501 });
}

export async function PUT() {
  return NextResponse.json({ detail: "Not configured" }, { status: 501 });
}

export async function DELETE() {
  return NextResponse.json({ detail: "Not configured" }, { status: 501 });
}

import { NextResponse } from "next/server";

const API_BASE = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").trim();

export async function GET(): Promise<NextResponse> {
  try {
    const upstream = await fetch(`${API_BASE}/setup/status`);
    const payload = await upstream.text();
    return new NextResponse(payload, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ setupRequired: true }, { status: 200 });
  }
}

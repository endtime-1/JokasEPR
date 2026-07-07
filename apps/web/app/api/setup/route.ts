import { type NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").trim();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/setup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  } catch {
    return NextResponse.json({ message: "API unreachable" }, { status: 502 });
  }
  const payload = await upstream.text();
  return new NextResponse(payload, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

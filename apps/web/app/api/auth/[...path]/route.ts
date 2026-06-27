import { type NextRequest, NextResponse } from "next/server";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001/api/v1").trim();

async function proxy(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const upstreamUrl = `${API_BASE}/auth/${segments.join("/")}`;

  const forwardHeaders: HeadersInit = { "content-type": "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) forwardHeaders["cookie"] = cookie;

  const body = request.method === "GET" ? undefined : await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
    });
  } catch {
    return NextResponse.json({ message: "API unreachable" }, { status: 502 });
  }

  const payload = await upstream.text();

  const response = new NextResponse(payload, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });

  // Copy every Set-Cookie header so cookies are owned by localhost:3000,
  // making them visible to the Next.js middleware.
  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", value);
  }

  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxy(request, path);
}

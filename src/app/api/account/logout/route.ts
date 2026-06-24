import { NextResponse } from "next/server";

import { clearAccountSessionCookie } from "@/server/accountAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/account", origin), { status: 303 });
  clearAccountSessionCookie(response);
  return response;
}

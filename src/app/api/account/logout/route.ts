import { NextResponse } from "next/server";

import { clearAccountSessionCookie, getRequestOrigin } from "@/server/accountAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const response = NextResponse.redirect(new URL("/account", origin), { status: 303 });
  clearAccountSessionCookie(response);
  return response;
}

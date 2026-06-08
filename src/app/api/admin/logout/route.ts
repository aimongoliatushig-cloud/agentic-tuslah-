import { NextResponse } from "next/server";

import { clearAdminSessionCookie } from "@/server/adminAuth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/admin/login", request.url), { status: 303 });
  clearAdminSessionCookie(response);
  return response;
}

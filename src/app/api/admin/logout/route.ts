import { NextResponse } from "next/server";

import { clearAdminSessionCookie } from "@/server/adminAuth";
import { optionalEnv } from "@/server/env";

function appUrl(path: string) {
  const baseUrl = optionalEnv("APP_BASE_URL");
  return new URL(path, baseUrl || "http://72.62.197.97:3010");
}

export async function POST() {
  const response = NextResponse.redirect(appUrl("/admin/login"), { status: 303 });
  clearAdminSessionCookie(response);
  return response;
}

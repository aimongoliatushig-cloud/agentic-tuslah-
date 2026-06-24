import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/server/accountAuth";
import { isAdminCookieSecure } from "@/server/adminAuth";
import { buildGoogleAuthUrl, isGoogleOAuthConfigured } from "@/server/googleOAuth";

export const runtime = "nodejs";

export const OAUTH_STATE_COOKIE = "agf_oauth_state";

export async function GET(request: Request) {
  const origin = getRequestOrigin(request);

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/account?error=google", origin), { status: 303 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildGoogleAuthUrl({ origin, state }), { status: 303 });
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isAdminCookieSecure(),
    maxAge: 600,
    path: "/"
  });
  return response;
}

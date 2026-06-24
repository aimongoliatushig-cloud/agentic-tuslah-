import { NextResponse } from "next/server";

import { isAdminCookieSecure } from "@/server/adminAuth";
import { getRequestOrigin, setAccountSessionCookie } from "@/server/accountAuth";
import { findActiveClientByEmail } from "@/server/api-gateway/accountData";
import { exchangeGoogleCode, fetchGoogleUserInfo, isGoogleOAuthConfigured } from "@/server/googleOAuth";
import { OAUTH_STATE_COOKIE } from "@/app/api/account/auth/google/route";

export const runtime = "nodejs";

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function redirectWithClearedState(origin: string, path: string) {
  const response = NextResponse.redirect(new URL(path, origin), { status: 303 });
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isAdminCookieSecure(),
    maxAge: 0,
    path: "/"
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);

  if (!isGoogleOAuthConfigured()) {
    return redirectWithClearedState(origin, "/account?error=google");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, OAUTH_STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithClearedState(origin, "/account?error=google");
  }

  const tokens = await exchangeGoogleCode({ code, origin });
  const info = tokens?.access_token ? await fetchGoogleUserInfo(tokens.access_token) : null;

  if (!info?.email || info.email_verified === false) {
    return redirectWithClearedState(origin, "/account?error=google");
  }

  const client = await findActiveClientByEmail(info.email);

  if (!client) {
    return redirectWithClearedState(origin, "/account?error=notfound");
  }

  const response = redirectWithClearedState(origin, "/account");
  setAccountSessionCookie(response, client.id);
  return response;
}

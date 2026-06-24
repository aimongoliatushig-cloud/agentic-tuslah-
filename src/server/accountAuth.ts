import crypto from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isProduction, optionalEnv } from "@/server/env";

export const ACCOUNT_SESSION_COOKIE = "agf_account_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getSessionSecret() {
  return (
    optionalEnv("API_GATEWAY_ADMIN_TOKEN") ??
    optionalEnv("SUPABASE_SERVICE_ROLE_KEY") ??
    "agf-account-dev-secret"
  );
}

function isCookieSecure() {
  const override = optionalEnv("API_GATEWAY_ADMIN_COOKIE_SECURE");

  if (override === "false") {
    return false;
  }

  if (override === "true") {
    return true;
  }

  return isProduction();
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function timingSafeEqualString(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

export function createAccountSessionValue(clientId: string) {
  const payload = Buffer.from(
    JSON.stringify({ sub: clientId, exp: Date.now() + SESSION_TTL_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAccountSession(value: string | undefined): { clientId: string } | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature || !timingSafeEqualString(signature, sign(payload))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      exp?: number;
    };

    if (!decoded.sub || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }

    return { clientId: decoded.sub };
  } catch {
    return null;
  }
}

export async function getAccountClientId() {
  const value = (await cookies()).get(ACCOUNT_SESSION_COOKIE)?.value;
  return verifyAccountSession(value)?.clientId ?? null;
}

export function setAccountSessionCookie(response: NextResponse, clientId: string) {
  response.cookies.set(ACCOUNT_SESSION_COOKIE, createAccountSessionValue(clientId), {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    maxAge: SESSION_TTL_MS / 1000,
    path: "/"
  });
}

export function clearAccountSessionCookie(response: NextResponse) {
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isCookieSecure(),
    maxAge: 0,
    path: "/"
  });
}

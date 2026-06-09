import crypto from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { isProduction, isUnsafeAdminDevAllowed, optionalEnv } from "@/server/env";

export const ADMIN_SESSION_COOKIE = "agf_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type AdminAuthResult =
  | { ok: true; subject: string; role: string }
  | { ok: false; status: number; code: string; message: string };

function timingSafeEqualString(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(left, right);
}

function getAdminToken() {
  return optionalEnv("API_GATEWAY_ADMIN_TOKEN");
}

function getAdminRole() {
  return optionalEnv("API_GATEWAY_ADMIN_ROLE") ?? "owner";
}

export function isAdminCookieSecure() {
  const override = optionalEnv("API_GATEWAY_ADMIN_COOKIE_SECURE");

  if (override === "false") {
    return false;
  }

  if (override === "true") {
    return true;
  }

  return isProduction();
}

function isAdminMisconfigured(): AdminAuthResult | null {
  if (getAdminToken() || isUnsafeAdminDevAllowed()) {
    return null;
  }

  return {
    ok: false,
    status: isProduction() ? 503 : 401,
    code: "admin_auth_not_configured",
    message: "Admin authentication is not configured."
  };
}

function signSession(payload: string, token: string) {
  return crypto.createHmac("sha256", token).update(payload).digest("base64url");
}

export function createAdminSessionCookieValue(token: string) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "admin-token",
      role: getAdminRole(),
      exp: Date.now() + SESSION_TTL_MS
    })
  ).toString("base64url");
  return `${payload}.${signSession(payload, token)}`;
}

export function verifyAdminSessionCookie(value: string | undefined): AdminAuthResult {
  const misconfigured = isAdminMisconfigured();

  if (misconfigured) {
    return misconfigured;
  }

  if (isUnsafeAdminDevAllowed() && !getAdminToken()) {
    return { ok: true, subject: "unsafe-dev-admin", role: "owner" };
  }

  const token = getAdminToken();
  if (!token || !value) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Admin authorization required."
    };
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature || !timingSafeEqualString(signature, signSession(payload, token))) {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Admin authorization required."
    };
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: string;
      role?: string;
      exp?: number;
    };

    if (!decoded.exp || decoded.exp < Date.now()) {
      return {
        ok: false,
        status: 401,
        code: "session_expired",
        message: "Admin session expired."
      };
    }

    return {
      ok: true,
      subject: decoded.sub ?? "admin-token",
      role: decoded.role ?? getAdminRole()
    };
  } catch {
    return {
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Admin authorization required."
    };
  }
}

function readBearerToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export function verifyAdminToken(providedToken: string | null | undefined) {
  const token = getAdminToken();
  return Boolean(token && providedToken && timingSafeEqualString(providedToken, token));
}

export function verifyAdminRequest(request: Request): AdminAuthResult {
  const misconfigured = isAdminMisconfigured();

  if (misconfigured) {
    return misconfigured;
  }

  if (isUnsafeAdminDevAllowed() && !getAdminToken()) {
    return { ok: true, subject: "unsafe-dev-admin", role: "owner" };
  }

  const token = getAdminToken();
  const providedToken = request.headers.get("x-admin-token") ?? readBearerToken(request);

  if (token && verifyAdminToken(providedToken)) {
    return { ok: true, subject: "admin-token", role: getAdminRole() };
  }

  return verifyAdminSessionCookie(readCookie(request, ADMIN_SESSION_COOKIE));
}

export function requireAdminAccess(request: Request) {
  const auth = verifyAdminRequest(request);
  return auth.ok
    ? null
    : NextResponse.json(
        {
          error: {
            code: auth.code,
            message: auth.message
          }
        },
        { status: auth.status }
      );
}

export async function requireDashboardAdmin() {
  const auth = verifyAdminSessionCookie((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);

  if (!auth.ok) {
    redirect(`/admin/login?next=${encodeURIComponent("/dashboard/api-gateway")}`);
  }

  return auth;
}

export function setAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionCookieValue(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: isAdminCookieSecure(),
    maxAge: SESSION_TTL_MS / 1000,
    path: "/"
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isAdminCookieSecure(),
    maxAge: 0,
    path: "/"
  });
}

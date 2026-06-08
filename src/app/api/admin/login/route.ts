import { NextResponse } from "next/server";

import { optionalEnv } from "@/server/env";
import { setAdminSessionCookie, verifyAdminToken } from "@/server/adminAuth";
import { writeAdminLoginAuditLog } from "@/server/adminAudit";
import { checkRateLimit } from "@/server/api-gateway/rateLimitService";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/dashboard/api-gateway";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/api-gateway";
}

function redirectToLogin(request: Request, next: string, retryAfter?: number) {
  const response = NextResponse.redirect(
    new URL(`/admin/login?error=1&next=${encodeURIComponent(next)}`, request.url),
    { status: 303 }
  );

  if (retryAfter) {
    response.headers.set("Retry-After", String(retryAfter));
  }

  return response;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  const rateLimit = await checkRateLimit({
    ip,
    route: "admin-login"
  });

  if (!rateLimit.allowed) {
    await writeAdminLoginAuditLog({
      request,
      success: false,
      reason: "rate_limited"
    });

    return redirectToLogin(request, "/dashboard/api-gateway", rateLimit.retryAfter);
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const next = safeNext(form.get("next"));
  const configuredToken = optionalEnv("API_GATEWAY_ADMIN_TOKEN");

  if (!configuredToken || !verifyAdminToken(token)) {
    await writeAdminLoginAuditLog({
      request,
      success: false,
      reason: "invalid_token"
    });

    return redirectToLogin(request, next);
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  setAdminSessionCookie(response, configuredToken);
  await writeAdminLoginAuditLog({
    request,
    success: true
  });
  return response;
}

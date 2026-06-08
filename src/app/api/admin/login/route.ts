import { NextResponse } from "next/server";

import { optionalEnv } from "@/server/env";
import { setAdminSessionCookie } from "@/server/adminAuth";

function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "/dashboard/api-gateway";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/api-gateway";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const next = safeNext(form.get("next"));
  const configuredToken = optionalEnv("API_GATEWAY_ADMIN_TOKEN");

  if (!configuredToken || token !== configuredToken) {
    return NextResponse.redirect(new URL(`/admin/login?error=1&next=${encodeURIComponent(next)}`, request.url), {
      status: 303
    });
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  setAdminSessionCookie(response, configuredToken);
  return response;
}

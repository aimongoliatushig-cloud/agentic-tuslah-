import { NextResponse } from "next/server";

import { getRequestOrigin, setAccountSessionCookie } from "@/server/accountAuth";
import { validateClient } from "@/server/api-gateway/gatewayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = getRequestOrigin(request);
  const formData = await request.formData();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (!apiKey) {
    return NextResponse.redirect(new URL("/account?error=1", origin), { status: 303 });
  }

  let client: Awaited<ReturnType<typeof validateClient>> = null;

  try {
    client = await validateClient(apiKey);
  } catch {
    client = null;
  }

  if (!client) {
    return NextResponse.redirect(new URL("/account?error=1", origin), { status: 303 });
  }

  const response = NextResponse.redirect(new URL("/account", origin), { status: 303 });
  setAccountSessionCookie(response, client.id);
  return response;
}

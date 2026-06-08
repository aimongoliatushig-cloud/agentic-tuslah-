import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request) {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

export function requireAdminAccess(request: Request) {
  const adminToken = process.env.API_GATEWAY_ADMIN_TOKEN;

  if (!adminToken) {
    return null;
  }

  const headerToken = request.headers.get("x-admin-token");
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (headerToken === adminToken || bearerToken === adminToken) {
    return null;
  }

  return jsonError("Admin authorization required.", 401);
}

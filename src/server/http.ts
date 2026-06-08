import { NextResponse } from "next/server";

import { requireAdminAccess } from "@/server/adminAuth";

export { requireAdminAccess };

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400, code = "internal_error", details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    },
    { status }
  );
}

export async function readJson<T>(request: Request, maxBytes = 128 * 1024) {
  const text = await request.text();
  const size = new TextEncoder().encode(text).byteLength;

  if (size > maxBytes) {
    throw new Error("Request body is too large.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON request body.");
  }
}

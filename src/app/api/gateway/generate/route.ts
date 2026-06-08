import { jsonError, jsonOk, readJson } from "@/server/http";
import { processGatewayRequest } from "@/server/api-gateway/gatewayService";
import type { GatewayGeneratePayload } from "@/server/api-gateway/types";

export const runtime = "nodejs";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = readBearerToken(request);

    if (!apiKey) {
      return jsonError("Missing Authorization: Bearer CLIENT_API_KEY header.", 401);
    }

    const payload = await readJson<GatewayGeneratePayload>(request);

    if (!payload.model) {
      return jsonError("Request body must include model.", 400);
    }

    const result = await processGatewayRequest({ apiKey, payload });
    return jsonOk({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway request failed.";
    const status =
      message.includes("Invalid or inactive") || message.includes("Missing Authorization")
        ? 401
        : message.includes("Insufficient") ||
            message.includes("Budget") ||
            message.includes("хэрэглээ дууссан")
          ? 402
          : message.includes("unavailable")
            ? 404
            : 400;

    return jsonError(message, status);
  }
}

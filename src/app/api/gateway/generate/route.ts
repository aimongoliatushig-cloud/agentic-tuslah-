import { jsonError, jsonOk, readJson } from "@/server/http";
import { processGatewayRequest } from "@/server/api-gateway/gatewayService";
import { validateGatewayGeneratePayload } from "@/server/api-gateway/validation";
import { checkRateLimit } from "@/server/api-gateway/rateLimitService";

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
      return jsonError("Missing Authorization: Bearer CLIENT_API_KEY header.", 401, "unauthorized");
    }

    const rateLimit = await checkRateLimit({
      apiKey,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      route: "generate"
    });

    if (!rateLimit.allowed) {
      return jsonError("Rate limit exceeded.", 429, "rate_limited", {
        retryAfter: rateLimit.retryAfter,
        limit: rateLimit.limit
      });
    }

    const rawPayload = await readJson<unknown>(request);
    const validation = validateGatewayGeneratePayload(rawPayload);

    if (!validation.ok) {
      return jsonError("Invalid gateway request.", 400, "invalid_request", validation.details);
    }

    const result = await processGatewayRequest({ apiKey, payload: validation.payload });
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

    const code =
      status === 401
        ? "unauthorized"
        : status === 402
          ? "usage_exhausted"
          : status === 404
            ? "model_unavailable"
            : message.includes("too large")
              ? "payload_too_large"
              : "gateway_error";

    return jsonError(message, status, code);
  }
}

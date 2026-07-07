import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/server/http";
import { readBearerToken } from "@/server/api-gateway/bearer";
import { processGatewayRequest } from "@/server/api-gateway/gatewayService";
import { checkRateLimit } from "@/server/api-gateway/rateLimitService";
import { validateGatewayGeneratePayload } from "@/server/api-gateway/validation";
import { optionalEnv } from "@/server/env";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

interface ImagesBody {
  model?: string;
  prompt?: string;
  n?: number;
  size?: string;
  aspect_ratio?: string;
  response_format?: string;
  [key: string]: unknown;
}

function sizeToAspectRatio(size?: string) {
  if (!size || size === "auto") {
    return "auto";
  }

  const [width, height] = size.toLowerCase().split("x").map((part) => Number(part));

  if (!width || !height) {
    return "auto";
  }

  if (width === height) {
    return "1:1";
  }

  if (width > height) {
    return width / height >= 1.7 ? "16:9" : "3:2";
  }

  return height / width >= 1.7 ? "9:16" : "2:3";
}

function urlsFromArray(value: unknown) {
  return Array.isArray(value)
    ? (value.filter((item) => typeof item === "string" && /^https?:\/\//i.test(item)) as string[])
    : [];
}

/** Pulls image URLs out of the provider response (Kie returns result_urls/images). */
function extractImageUrls(provider: Json): string[] {
  const urls = new Set<string>();

  if (provider && typeof provider === "object" && !Array.isArray(provider)) {
    const record = provider as Record<string, unknown>;
    [...urlsFromArray(record.result_urls), ...urlsFromArray(record.images)].forEach((url) => urls.add(url));

    if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
      const nested = record.data as Record<string, unknown>;
      [...urlsFromArray(nested.result_urls), ...urlsFromArray(nested.images)].forEach((url) => urls.add(url));
    }
  }

  return Array.from(urls);
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
      route: "images"
    });

    if (!rateLimit.allowed) {
      return jsonError("Rate limit exceeded.", 429, "rate_limited", {
        retryAfter: rateLimit.retryAfter,
        limit: rateLimit.limit
      });
    }

    const body = await readJson<ImagesBody>(request);

    if (!body.prompt || typeof body.prompt !== "string") {
      return jsonError("Request body must include prompt.", 400, "invalid_request");
    }

    // The gateway has a single image backend (Kie). Force the configured image
    // model so any OpenAI image model name (dall-e-3, gpt-image-1, …) routes to it.
    const imageModel = optionalEnv("API_GATEWAY_IMAGE_MODEL") ?? body.model ?? "gpt-image-2";
    const aspectRatio =
      typeof body.aspect_ratio === "string" ? body.aspect_ratio : sizeToAspectRatio(body.size);

    const payload = {
      model: imageModel,
      prompt: body.prompt,
      parameters: { aspect_ratio: aspectRatio } as Record<string, unknown>
    };
    const validation = validateGatewayGeneratePayload(payload);

    if (!validation.ok) {
      return jsonError("Invalid gateway request.", 400, "invalid_request", validation.details);
    }

    const result = await processGatewayRequest({ apiKey, payload: validation.payload });
    const urls = extractImageUrls(result.provider);

    if (urls.length === 0) {
      return jsonError("Image provider returned no image.", 502, "image_generation_failed");
    }

    return NextResponse.json({
      created: Math.floor(Date.now() / 1000),
      data: urls.map((url) => ({ url }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    const status = message.includes("Invalid or inactive")
      ? 401
      : message.includes("Insufficient") || message.includes("Budget") || message.includes("хэрэглээ дууссан")
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
            : "image_generation_failed";

    return jsonError(message, status, code);
  }
}

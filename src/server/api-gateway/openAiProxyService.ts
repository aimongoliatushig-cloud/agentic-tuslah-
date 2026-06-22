import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { checkBudgetBeforeRequest } from "@/server/api-gateway/budgetService";
import { deductCredit, refundCreditForRequest } from "@/server/api-gateway/creditService";
import {
  calculateCreditCost,
  logUsage,
  resolveModel,
  validateClient
} from "@/server/api-gateway/gatewayService";
import type { ApiClient, ApiModel, GatewayGeneratePayload, ProviderResult } from "@/server/api-gateway/types";
import { readIntEnv } from "@/server/env";
import { jsonError } from "@/server/http";
import { checkRateLimit } from "@/server/api-gateway/rateLimitService";
import type { Json } from "@/lib/database.types";

type OpenAiChatBody = Record<string, unknown> & {
  model?: string;
  messages?: unknown[];
  stream?: boolean;
  stream_options?: unknown;
};
type PreparedGatewayRequest =
  | { ok: true; apiKey: string; client: ApiClient; model: ApiModel }
  | { ok: false; error: Response };

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

export function isOpenAiCompatibleRequestMode() {
  return process.env.UPSTREAM_AI_REQUEST_MODE === "openai-compatible";
}

function getUpstreamChatCompletionsUrl() {
  const baseUrl = process.env.UPSTREAM_AI_BASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error("Missing UPSTREAM_AI_BASE_URL.");
  }

  if (baseUrl.endsWith("/chat/completions")) {
    return baseUrl;
  }

  return `${baseUrl}/chat/completions`;
}

function getUpstreamHeaders() {
  const apiKey = process.env.UPSTREAM_AI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing UPSTREAM_AI_API_KEY.");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function sanitizeParameters(body: OpenAiChatBody) {
  const parameters = { ...body };
  delete parameters.model;
  delete parameters.messages;
  return parameters;
}

function buildGatewayPayload(body: OpenAiChatBody): GatewayGeneratePayload {
  return {
    model: body.model ?? "deepseek-v4-flash",
    input: {
      messages: body.messages ?? []
    } as Json,
    parameters: sanitizeParameters(body)
  };
}

function buildUpstreamBody(body: OpenAiChatBody, model: ApiModel) {
  return {
    ...body,
    model: model.provider_model
  };
}

function isKieModel(model: ApiModel) {
  return model.provider.toLowerCase() === "kie.ai";
}

function debugEnabled() {
  return process.env.DEBUG_GATEWAY === "true";
}

function debugLogIncoming(body: OpenAiChatBody) {
  if (!debugEnabled()) {
    return;
  }

  console.info("[api-gateway] incoming chat completion", {
    bodyKeys: Object.keys(body),
    model: body.model,
    messagesCount: Array.isArray(body.messages) ? body.messages.length : 0,
    hasTools: Array.isArray(body.tools),
    toolsCount: Array.isArray(body.tools) ? body.tools.length : 0,
    toolChoice: body.tool_choice,
    stream: body.stream === true
  });
}

function debugLogUpstream(status: number, data?: unknown) {
  if (!debugEnabled()) {
    return;
  }

  const firstChoice =
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "choices" in data &&
    Array.isArray(data.choices)
      ? data.choices[0]
      : undefined;
  const message =
    firstChoice &&
    typeof firstChoice === "object" &&
    "message" in firstChoice &&
    firstChoice.message &&
    typeof firstChoice.message === "object"
      ? firstChoice.message
      : undefined;

  console.info("[api-gateway] upstream chat completion", {
    status,
    finishReason:
      firstChoice && typeof firstChoice === "object" && "finish_reason" in firstChoice
        ? firstChoice.finish_reason
        : undefined,
    hasToolCalls:
      Boolean(message) &&
      "tool_calls" in (message as Record<string, unknown>) &&
      Array.isArray((message as Record<string, unknown>).tool_calls)
  });
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeoutMs = readIntEnv("UPSTREAM_AI_TIMEOUT_MS", 30000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text || response.statusText };
  }
}

function extractUsage(data: unknown) {
  const usage =
    data && typeof data === "object" && !Array.isArray(data) && "usage" in data ? data.usage : undefined;

  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return {};
  }

  const usageRecord = usage as Record<string, unknown>;
  const inputTokens =
    typeof usageRecord.prompt_tokens === "number"
      ? usageRecord.prompt_tokens
      : typeof usageRecord.input_tokens === "number"
        ? usageRecord.input_tokens
        : undefined;
  const outputTokens =
    typeof usageRecord.completion_tokens === "number"
      ? usageRecord.completion_tokens
      : typeof usageRecord.output_tokens === "number"
        ? usageRecord.output_tokens
        : undefined;
  const totalTokens =
    typeof usageRecord.total_tokens === "number"
      ? usageRecord.total_tokens
      : inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCacheHitTokens:
      typeof usageRecord.prompt_cache_hit_tokens === "number"
        ? usageRecord.prompt_cache_hit_tokens
        : undefined,
    inputCacheMissTokens:
      typeof usageRecord.prompt_cache_miss_tokens === "number"
        ? usageRecord.prompt_cache_miss_tokens
        : undefined
  };
}

function providerResultFromData(data: unknown, success: boolean, error?: string): ProviderResult {
  return {
    success,
    data: data as ProviderResult["data"],
    error,
    ...extractUsage(data)
  };
}

async function refundAndLogFailure(params: {
  client: ApiClient;
  model: ApiModel;
  requestId: string;
  creditCost: number;
  providerResult: ProviderResult;
  startedAt: number;
}) {
  try {
    await refundCreditForRequest(
      params.client.id,
      params.creditCost,
      params.requestId,
      `Gateway refund ${params.requestId} for failed ${params.model.name}`
    );
  } catch (error) {
    params.providerResult.data = {
      provider: params.providerResult.data,
      refundError: error instanceof Error ? error.message : "Unable to refund reserved credit."
    };
  }

  await logUsage({
    client: params.client,
    model: params.model,
    requestId: params.requestId,
    status: "failed",
    creditCost: 0,
    providerResult: params.providerResult,
    latencyMs: Date.now() - params.startedAt
  });
}

async function prepareGatewayRequest(
  request: Request,
  body: OpenAiChatBody
): Promise<PreparedGatewayRequest> {
  const apiKey = readBearerToken(request);

  if (!apiKey) {
    return { ok: false, error: jsonError("Missing Authorization: Bearer CLIENT_API_KEY header.", 401, "unauthorized") };
  }

  const rateLimit = await checkRateLimit({
    apiKey,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    route: "chat-completions"
  });

  if (!rateLimit.allowed) {
    return {
      ok: false,
      error: jsonError("Rate limit exceeded.", 429, "rate_limited", {
        retryAfter: rateLimit.retryAfter,
        limit: rateLimit.limit
      })
    };
  }

  if (!body.model) {
    return { ok: false, error: jsonError("Request body must include model.", 400, "invalid_request") };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, error: jsonError("Request body must include messages.", 400, "invalid_request") };
  }

  const client = await validateClient(apiKey);

  if (!client) {
    return { ok: false, error: jsonError("Invalid or inactive API key.", 401, "unauthorized") };
  }

  const model = await resolveModel(body.model);

  if (!model) {
    return { ok: false, error: jsonError("Requested model is unavailable.", 404, "model_unavailable") };
  }

  if (isKieModel(model)) {
    return {
      ok: false,
      error: jsonError(
        "Kie.ai models must use /api/tools/kie/* endpoints, not /v1/chat/completions.",
        400,
        "invalid_chat_model"
      )
    };
  }

  return { ok: true, apiKey, client, model };
}

export async function handleOpenAiCompatibleChatCompletion(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const body = (await request.json()) as OpenAiChatBody;
  debugLogIncoming(body);

  const prepared = await prepareGatewayRequest(request, body);

  if (!prepared.ok) {
    return prepared.error;
  }

  const { client, model } = prepared;
  const payload = buildGatewayPayload(body);
  const budgetCheck = await checkBudgetBeforeRequest({
    client,
    model,
    payload
  });

  if (!budgetCheck.allowed) {
    await logUsage({
      client,
      model,
      requestId,
      status: "failed",
      creditCost: 0,
      providerResult: {
        success: false,
        data: {
          reason: "budget_exceeded",
          estimatedCostUsd: budgetCheck.estimatedCostUsd,
          scopeType: budgetCheck.scopeType,
          scopeKey: budgetCheck.scopeKey,
          period: budgetCheck.period,
          limitUsd: budgetCheck.limitUsd,
          spentUsd: budgetCheck.spentUsd,
          projectedUsd: budgetCheck.projectedUsd
        },
        error: "Usage limit exceeded."
      },
      latencyMs: Date.now() - startedAt
    });
    return jsonError("Usage limit exceeded.", 402, "usage_exhausted");
  }

  const creditCost = calculateCreditCost(model);
  let transaction: Awaited<ReturnType<typeof deductCredit>>;

  try {
    transaction = await deductCredit(
      client.id,
      creditCost,
      `Gateway reservation ${requestId} for ${model.name}`,
      requestId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reserve credit.";
    await logUsage({
      client,
      model,
      requestId,
      status: "failed",
      creditCost: 0,
      providerResult: {
        success: false,
        data: { reason: "credit_reservation_failed", requiredCredit: creditCost },
        error: message
      },
      latencyMs: Date.now() - startedAt
    });
    return jsonError(message, message.includes("Insufficient") ? 402 : 400, "usage_exhausted");
  }

  const upstreamBody = buildUpstreamBody(body, model);
  const upstream = await fetchWithTimeout(getUpstreamChatCompletionsUrl(), {
    method: "POST",
    headers: getUpstreamHeaders(),
    body: JSON.stringify(upstreamBody)
  });

  if (body.stream === true) {
    if (!upstream.ok) {
      const data = await parseResponse(upstream);
      const providerResult = providerResultFromData(data, false, `Upstream provider failed with status ${upstream.status}.`);
      await refundAndLogFailure({ client, model, requestId, creditCost, providerResult, startedAt });
      debugLogUpstream(upstream.status, data);
      return NextResponse.json(data, { status: upstream.status });
    }

    await logUsage({
      client,
      model,
      requestId,
      status: "success",
      creditCost,
      providerResult: {
        success: true,
        data: {
          stream: true,
          upstreamStatus: upstream.status,
          balanceAfter: transaction.balance_after
        }
      },
      latencyMs: Date.now() - startedAt
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      }
    });
  }

  const data = await parseResponse(upstream);
  debugLogUpstream(upstream.status, data);
  const providerResult = providerResultFromData(
    data,
    upstream.ok,
    upstream.ok ? undefined : `Upstream provider failed with status ${upstream.status}.`
  );

  if (!upstream.ok) {
    await refundAndLogFailure({ client, model, requestId, creditCost, providerResult, startedAt });
    return NextResponse.json(data, { status: upstream.status });
  }

  await logUsage({
    client,
    model,
    requestId,
    status: "success",
    creditCost,
    providerResult,
    latencyMs: Date.now() - startedAt
  });

  return NextResponse.json(data, { status: upstream.status });
}

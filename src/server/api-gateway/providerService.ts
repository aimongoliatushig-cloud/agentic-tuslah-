import type { ProviderPayload, ProviderResult } from "@/server/api-gateway/types";
import { isProduction, readIntEnv, readJsonEnv } from "@/server/env";

type RequestMode = "generic" | "openai-compatible";
type OpenAiMessage = {
  role: string;
  content: unknown;
};

export function isMockProviderMode() {
  const missingConfig = !process.env.UPSTREAM_AI_API_KEY || !process.env.UPSTREAM_AI_BASE_URL;
  return missingConfig && (!isProduction() || process.env.API_GATEWAY_ALLOW_MOCK_PROVIDER === "true");
}

export function getProviderRuntimeConfig() {
  const hasProviderConfig = Boolean(process.env.UPSTREAM_AI_API_KEY && process.env.UPSTREAM_AI_BASE_URL);

  return {
    mockProviderMode: isMockProviderMode(),
    providerReady: hasProviderConfig || isMockProviderMode(),
    requestMode: (process.env.UPSTREAM_AI_REQUEST_MODE ?? "generic") as RequestMode,
    timeoutMs: readIntEnv("UPSTREAM_AI_TIMEOUT_MS", 30000),
    retryCount: Math.min(3, readIntEnv("UPSTREAM_AI_RETRY_COUNT", 1))
  };
}

function getPrompt(payload: ProviderPayload) {
  if (payload.request.prompt) {
    return payload.request.prompt;
  }

  if (payload.request.input) {
    return JSON.stringify(payload.request.input);
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOpenAiMessages(payload: ProviderPayload) {
  const input = payload.request.input;

  if (!isRecord(input) || !Array.isArray(input.messages)) {
    return null;
  }

  const rawMessages = input.messages as unknown[];
  const messages = rawMessages.filter(isRecord).map((message) => ({
    role: typeof message.role === "string" ? message.role : "user",
    content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")
  }));

  return messages.length > 0 ? (messages as OpenAiMessage[]) : null;
}

function buildRequestBody(payload: ProviderPayload, requestMode: RequestMode) {
  const prompt = getPrompt(payload);

  if (requestMode === "openai-compatible") {
    return {
      model: payload.model.provider_model,
      messages: getOpenAiMessages(payload) ?? [{ role: "user", content: prompt }],
      ...(payload.request.parameters ?? {})
    };
  }

  return {
    model: payload.model.provider_model,
    prompt: payload.request.prompt,
    input: payload.request.input,
    parameters: payload.request.parameters
  };
}

function buildProviderUrl(baseUrl: string, requestMode: RequestMode) {
  const normalized = baseUrl.replace(/\/$/, "");

  if (requestMode === "openai-compatible") {
    if (normalized.endsWith("/chat/completions")) {
      return normalized;
    }

    return `${normalized}/chat/completions`;
  }

  return normalized;
}

function extractTokenUsage(data: ProviderResult["data"]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }

  const usage = "usage" in data ? data.usage : undefined;

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
  const details =
    usageRecord.prompt_tokens_details &&
    typeof usageRecord.prompt_tokens_details === "object" &&
    !Array.isArray(usageRecord.prompt_tokens_details)
      ? (usageRecord.prompt_tokens_details as Record<string, unknown>)
      : {};
  const inputCacheHitTokens =
    typeof usageRecord.prompt_cache_hit_tokens === "number"
      ? usageRecord.prompt_cache_hit_tokens
      : typeof details.cached_tokens === "number"
        ? details.cached_tokens
        : undefined;
  const inputCacheMissTokens =
    typeof usageRecord.prompt_cache_miss_tokens === "number"
      ? usageRecord.prompt_cache_miss_tokens
      : inputTokens !== undefined && inputCacheHitTokens !== undefined
        ? Math.max(0, inputTokens - inputCacheHitTokens)
        : undefined;

  return { inputTokens, outputTokens, totalTokens, inputCacheHitTokens, inputCacheMissTokens };
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : undefined;
}

function extractImageCount(data: ProviderResult["data"]): number | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const response = record.response;
  const nestedResponse =
    response && typeof response === "object" && !Array.isArray(response)
      ? (response as Record<string, unknown>)
      : null;
  const dataRecord =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;

  return (
    arrayLength(record.result_urls) ??
    arrayLength(record.images) ??
    arrayLength(record.output) ??
    arrayLength(nestedResponse?.result_urls) ??
    arrayLength(nestedResponse?.images) ??
    arrayLength(dataRecord?.result_urls) ??
    arrayLength(dataRecord?.images)
  );
}

async function parseProviderResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json().catch(() => null)) as ProviderResult["data"];
  }

  const text = await response.text().catch(() => "");
  return { text };
}

function sanitizeExtraHeaders(headers: Record<string, string>) {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();

    if (normalized === "authorization" || normalized === "content-type") {
      continue;
    }

    if (!isByteString(value)) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function isByteString(value: string) {
  return Array.from(value).every((char) => char.charCodeAt(0) <= 255);
}

function isValidProviderApiKey(value: string) {
  return isByteString(value) && !/[А-Яа-яӨөҮүЁё]/.test(value);
}

function redactProviderData(data: ProviderResult["data"]): ProviderResult["data"] {
  const maxLength = readIntEnv("API_GATEWAY_PROVIDER_RESPONSE_MAX_CHARS", 20_000);
  const shouldStoreRaw = process.env.API_GATEWAY_STORE_RAW_PROVIDER_RESPONSE === "true";

  if (shouldStoreRaw) {
    return data;
  }

  const text = JSON.stringify(data, (key, value) => {
    const normalized = key.toLowerCase();

    if (normalized.includes("authorization") || normalized.includes("api_key") || normalized.includes("token")) {
      return "[redacted]";
    }

    return value;
  });

  if (text.length <= maxLength) {
    return JSON.parse(text) as ProviderResult["data"];
  }

  return {
    truncated: true,
    originalLength: text.length,
    preview: text.slice(0, maxLength)
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
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

export async function callUpstreamProvider(
  payload: ProviderPayload
): Promise<ProviderResult> {
  const apiKey = process.env.UPSTREAM_AI_API_KEY;
  const baseUrl = process.env.UPSTREAM_AI_BASE_URL;
  const config = getProviderRuntimeConfig();

  if (config.mockProviderMode) {
    return {
      success: true,
      data: {
        mode: "mock",
        model: payload.model.name,
        providerModel: payload.model.provider_model,
        prompt: payload.request.prompt ?? null,
        output: "Mock provider response. Configure UPSTREAM_AI_API_KEY and UPSTREAM_AI_BASE_URL to call a real provider."
      },
      inputTokens: payload.request.prompt?.length ?? 0,
      outputTokens: 0,
      totalTokens: payload.request.prompt?.length ?? 0
    };
  }

  if (!apiKey || !baseUrl) {
    return {
      success: false,
      data: {
        error: "provider_not_configured",
        mockProviderMode: false
      },
      error: "Provider is not configured."
    };
  }

  if (!isValidProviderApiKey(apiKey)) {
    return {
      success: false,
      data: {
        error: "provider_invalid_api_key",
        reason: "UPSTREAM_AI_API_KEY contains non-HTTP-header characters. Replace placeholder text with the real provider key."
      },
      error: "Provider API key is invalid or contains unsupported characters."
    };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...sanitizeExtraHeaders(readJsonEnv("UPSTREAM_AI_EXTRA_HEADERS_JSON"))
  };
  const body = JSON.stringify(buildRequestBody(payload, config.requestMode));
  let lastError = "Upstream provider request failed.";

  const providerUrl = buildProviderUrl(baseUrl, config.requestMode);

  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        providerUrl,
        {
          method: "POST",
          headers,
          body
        },
        config.timeoutMs
      );
      const data = redactProviderData(await parseProviderResponse(response));

      if (!response.ok) {
        lastError = `Upstream provider failed with status ${response.status}.`;

        if (response.status >= 500 && attempt < config.retryCount) {
          await sleep(150 * 2 ** attempt + Math.floor(Math.random() * 75));
          continue;
        }

        return {
          success: false,
          data,
          error: lastError
        };
      }

      return {
        success: true,
        data,
        ...extractTokenUsage(data),
        imageCount: extractImageCount(data)
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;

      if (attempt >= config.retryCount) {
        break;
      }

      await sleep(150 * 2 ** attempt + Math.floor(Math.random() * 75));
    }
  }

  return {
    success: false,
    data: { error: lastError },
    error: lastError
  };
}

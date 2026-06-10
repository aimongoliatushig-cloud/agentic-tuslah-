import type { ProviderPayload, ProviderResult } from "@/server/api-gateway/types";
import { isProduction, readIntEnv, readJsonEnv } from "@/server/env";

type RequestMode = "generic" | "openai-compatible";
type OpenAiMessage = {
  role: string;
  content: unknown;
};
type KieTaskState = "waiting" | "queuing" | "generating" | "success" | "fail" | "unknown";

export function isMockProviderMode() {
  const missingConfig = !process.env.UPSTREAM_AI_API_KEY || !process.env.UPSTREAM_AI_BASE_URL;
  return missingConfig && (!isProduction() || process.env.API_GATEWAY_ALLOW_MOCK_PROVIDER === "true");
}

export function getProviderRuntimeConfig() {
  const hasProviderConfig = Boolean(process.env.UPSTREAM_AI_API_KEY && process.env.UPSTREAM_AI_BASE_URL);
  const hasKieProviderConfig = Boolean(process.env.KIE_AI_API_KEY);

  return {
    mockProviderMode: isMockProviderMode(),
    providerReady: hasProviderConfig || hasKieProviderConfig || isMockProviderMode(),
    kieProviderReady: hasKieProviderConfig,
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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isKieGptImage2Model(payload: ProviderPayload) {
  const provider = payload.model.provider.toLowerCase();
  const modelName = payload.model.name.toLowerCase();
  const providerModel = payload.model.provider_model.toLowerCase();

  return (
    provider === "kie.ai" &&
    (
      modelName === "gpt-image-2" ||
      providerModel === "gpt-image-2-text-to-image" ||
      providerModel === "openai/gpt-image-2"
    )
  );
}

function isKieProvider(payload: ProviderPayload) {
  return payload.model.provider.toLowerCase() === "kie.ai";
}

function getKieProviderModel(payload: ProviderPayload) {
  const providerModel = payload.model.provider_model.toLowerCase();

  if (providerModel === "openai/gpt-image-2" || payload.model.name.toLowerCase() === "gpt-image-2") {
    return "gpt-image-2-text-to-image";
  }

  return payload.model.provider_model;
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

function buildKieUrl(path: string) {
  const baseUrl = (process.env.KIE_AI_BASE_URL ?? "https://api.kie.ai").replace(/\/$/, "");
  return `${baseUrl}${path}`;
}

function getKieAspectRatio(payload: ProviderPayload) {
  const input = isRecord(payload.request.input) ? payload.request.input : {};
  const parameters = payload.request.parameters ?? {};
  const value = normalizeString(parameters.aspect_ratio) || normalizeString(input.aspect_ratio);

  return value || "auto";
}

function buildKieCreateTaskBody(payload: ProviderPayload) {
  const callbackUrl = normalizeString(process.env.KIE_AI_CALLBACK_URL);

  return {
    model: getKieProviderModel(payload),
    ...(callbackUrl ? { callBackUrl: callbackUrl } : {}),
    input: {
      prompt: getPrompt(payload),
      aspect_ratio: getKieAspectRatio(payload)
    }
  };
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

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJsonObject(value: unknown) {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectStringUrls(value: unknown, result = new Set<string>()) {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      result.add(value);
    }

    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringUrls(item, result);
    }

    return result;
  }

  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      collectStringUrls(nested, result);
    }
  }

  return result;
}

function extractKieTaskId(data: ProviderResult["data"]) {
  if (!isRecord(data)) {
    return null;
  }

  const rootTaskId =
    normalizeString(data.taskId) ||
    normalizeString(data.task_id) ||
    normalizeString(data.id) ||
    normalizeString(data.jobId) ||
    normalizeString(data.job_id);
  if (rootTaskId) {
    return rootTaskId;
  }

  const nested = isRecord(data.data) ? data.data : null;
  const parsedNested = parseJsonObject(data.data);
  const nestedTaskId =
    normalizeString(nested?.taskId) ||
    normalizeString(nested?.task_id) ||
    normalizeString(nested?.id) ||
    normalizeString(nested?.jobId) ||
    normalizeString(nested?.job_id) ||
    normalizeString(parsedNested?.taskId) ||
    normalizeString(parsedNested?.task_id) ||
    normalizeString(parsedNested?.id) ||
    normalizeString(parsedNested?.jobId) ||
    normalizeString(parsedNested?.job_id);

  return nestedTaskId || null;
}

function getKieEnvelopeError(data: ProviderResult["data"]) {
  if (!isRecord(data)) {
    return null;
  }

  const code = data.code;
  const success =
    code === undefined ||
    code === 200 ||
    code === "200" ||
    code === 0 ||
    code === "0";

  if (success) {
    return null;
  }

  return (
    normalizeString(data.msg) ||
    normalizeString(data.message) ||
    normalizeString(data.error) ||
    normalizeString(extractKieTaskData(data).failMsg) ||
    `Kie provider returned code ${String(code)}.`
  );
}

function extractKieTaskData(data: ProviderResult["data"]) {
  if (!isRecord(data)) {
    return {};
  }

  return isRecord(data.data) ? data.data : data;
}

function extractKieState(taskData: Record<string, unknown>): KieTaskState {
  const value = (
    normalizeString(taskData.state) ||
    normalizeString(taskData.status) ||
    normalizeString(taskData.taskStatus)
  ).toLowerCase();

  if (value === "waiting" || value === "queuing" || value === "generating") {
    return value;
  }

  if (["success", "completed", "complete", "finished", "done"].includes(value)) {
    return "success";
  }

  if (["fail", "failed", "error", "cancelled", "canceled", "create_task_failed", "generate_failed"].includes(value)) {
    return "fail";
  }

  return "unknown";
}

function extractKieResult(taskData: Record<string, unknown>) {
  const parsedResult = parseJsonObject(taskData.resultJson);
  const urlSet = collectStringUrls(parsedResult ?? taskData);
  const resultUrls = Array.from(urlSet);
  const creditsConsumed =
    numberValue(taskData.creditsConsumed) ??
    numberValue(taskData.credits_consumed) ??
    numberValue(parsedResult?.creditsConsumed) ??
    numberValue(parsedResult?.credits_consumed);

  return { resultUrls, creditsConsumed };
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

    if (isSensitiveProviderField(normalized)) {
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

function isSensitiveProviderField(normalizedKey: string) {
  return (
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("api_key") ||
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("password") ||
    normalizedKey === "token" ||
    normalizedKey.endsWith("_token") && !normalizedKey.endsWith("_tokens") ||
    normalizedKey.endsWith("-token") && !normalizedKey.endsWith("-tokens")
  );
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

async function callKieGptImage2Provider(payload: ProviderPayload): Promise<ProviderResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  const timeoutMs = readIntEnv("UPSTREAM_AI_TIMEOUT_MS", 30000);
  const pollIntervalMs = readIntEnv("KIE_AI_POLL_INTERVAL_MS", 3000);
  const pollTimeoutMs = readIntEnv("KIE_AI_POLL_TIMEOUT_MS", 180000);
  const prompt = getPrompt(payload);

  if (!apiKey) {
    return {
      success: false,
      data: {
        error: "kie_provider_not_configured"
      },
      error: "Kie provider is not configured."
    };
  }

  if (!isValidProviderApiKey(apiKey)) {
    return {
      success: false,
      data: {
        error: "kie_provider_invalid_api_key"
      },
      error: "Kie provider API key is invalid or contains unsupported characters."
    };
  }

  if (!prompt) {
    return {
      success: false,
      data: {
        error: "kie_prompt_required"
      },
      error: "Prompt is required for Kie GPT Image 2."
    };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  try {
    const createResponse = await fetchWithTimeout(
      buildKieUrl("/api/v1/jobs/createTask"),
      {
        method: "POST",
        headers,
        body: JSON.stringify(buildKieCreateTaskBody(payload))
      },
      timeoutMs
    );
    const createData = redactProviderData(await parseProviderResponse(createResponse));

    if (!createResponse.ok) {
      return {
        success: false,
        data: createData,
        error: `Kie provider failed with status ${createResponse.status}.`
      };
    }

    const createEnvelopeError = getKieEnvelopeError(createData);

    if (createEnvelopeError) {
      return {
        success: false,
        data: createData,
        error: createEnvelopeError
      };
    }

    const taskId = extractKieTaskId(createData);

    if (!taskId) {
      return {
        success: false,
        data: createData,
        error: "Kie provider did not return a task ID."
      };
    }

    const startedAt = Date.now();
    let latestData: ProviderResult["data"] = createData;

    while (Date.now() - startedAt < pollTimeoutMs) {
      await sleep(pollIntervalMs);

      const detailResponse = await fetchWithTimeout(
        buildKieUrl(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`),
        {
          method: "GET",
          headers
        },
        timeoutMs
      );
      latestData = redactProviderData(await parseProviderResponse(detailResponse));

      if (!detailResponse.ok) {
        return {
          success: false,
          data: latestData,
          error: `Kie task detail failed with status ${detailResponse.status}.`
        };
      }

      const detailEnvelopeError = getKieEnvelopeError(latestData);

      if (detailEnvelopeError) {
        return {
          success: false,
          data: latestData,
          error: detailEnvelopeError
        };
      }

      const taskData = extractKieTaskData(latestData);
      const state = extractKieState(taskData);

      if (state === "success") {
        const { resultUrls, creditsConsumed } = extractKieResult(taskData);
        const data = redactProviderData({
          provider: "kie.ai",
          taskId,
          state,
          model: getKieProviderModel(payload),
          result_urls: resultUrls,
          images: resultUrls,
          output: resultUrls.join("\n"),
          creditsConsumed,
          raw: latestData
        });

        return {
          success: true,
          data,
          imageCount: resultUrls.length || 1,
          billableUnits: (creditsConsumed ?? resultUrls.length) || 1
        };
      }

      if (state === "fail") {
        return {
          success: false,
          data: latestData,
          error:
            normalizeString(taskData.failMsg) ||
            normalizeString(taskData.error_message) ||
            "Kie provider task failed."
        };
      }
    }

    return {
      success: true,
      data: redactProviderData({
        provider: "kie.ai",
        taskId,
        state: "pending",
        model: getKieProviderModel(payload),
        output: `Kie task accepted but did not complete before timeout. Task ID: ${taskId}`,
        raw: latestData
      }),
      imageCount: 0,
      billableUnits: 1
    };
  } catch (error) {
    return {
      success: false,
      data: {
        error: error instanceof Error ? error.message : "Kie provider request failed."
      },
      error: error instanceof Error ? error.message : "Kie provider request failed."
    };
  }
}

export async function callUpstreamProvider(
  payload: ProviderPayload
): Promise<ProviderResult> {
  if (isKieGptImage2Model(payload)) {
    return callKieGptImage2Provider(payload);
  }

  if (isKieProvider(payload)) {
    return {
      success: false,
      data: {
        error: "unsupported_kie_model",
        provider: payload.model.provider,
        model: payload.model.name,
        providerModel: payload.model.provider_model
      },
      error: "Only Kie GPT Image 2 is currently enabled."
    };
  }

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

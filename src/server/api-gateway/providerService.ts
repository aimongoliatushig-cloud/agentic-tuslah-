import { fetchWithTimeout } from "@/server/api-gateway/fetchTimeout";
import { redactProviderData } from "@/server/api-gateway/providerRedact";
import { extractTokenUsage } from "@/server/api-gateway/usageExtract";
import type { ProviderPayload, ProviderResult } from "@/server/api-gateway/types";
import { isProduction, readIntEnv, readJsonEnv } from "@/server/env";

type RequestMode = "generic" | "openai-compatible";
type OpenAiMessage = Record<string, unknown> & {
  role: string;
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

function isKieProvider(payload: ProviderPayload) {
  return payload.model.provider.toLowerCase() === "kie.ai";
}

function getModelConfig(payload: ProviderPayload): Record<string, unknown> {
  return isRecord(payload.model.config) ? payload.model.config : {};
}

/**
 * Kie exposes two API families: the generic "market" jobs API
 * (createTask/recordInfo — images, Kling video, …) and dedicated per-model
 * APIs like Veo (/api/v1/veo/generate). Models opt into the dedicated flow
 * via api_models.config.kie_flow.
 */
function getKieFlow(payload: ProviderPayload): "veo" | "jobs" {
  return getModelConfig(payload).kie_flow === "veo" ? "veo" : "jobs";
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
  const messages = rawMessages.filter(isRecord).map((message) => {
    const role = typeof message.role === "string" ? message.role : "user";

    return {
      ...message,
      role,
      content: "content" in message ? message.content : ""
    };
  });

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
  const config = getModelConfig(payload);
  const inputDefaults = isRecord(config.input_defaults) ? config.input_defaults : {};
  const parameters = payload.request.parameters ?? {};
  const extraInput: Record<string, unknown> = {};

  // Client parameters (duration, sound, mode, image_urls, …) pass through to
  // the Kie task input; prompt/aspect_ratio stay canonical below.
  for (const [key, value] of Object.entries(parameters)) {
    if (key === "aspect_ratio" || value === undefined) {
      continue;
    }

    extraInput[key] = value;
  }

  return {
    model: getKieProviderModel(payload),
    ...(callbackUrl ? { callBackUrl: callbackUrl } : {}),
    input: {
      ...inputDefaults,
      ...extraInput,
      prompt: getPrompt(payload),
      aspect_ratio: getKieAspectRatio(payload)
    }
  };
}

function getKiePollTimeoutMs(payload: ProviderPayload) {
  const configured = numberValue(getModelConfig(payload).poll_timeout_ms);
  return configured ?? readIntEnv("KIE_AI_POLL_TIMEOUT_MS", 180000);
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callKieJobsProvider(payload: ProviderPayload): Promise<ProviderResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  const timeoutMs = readIntEnv("UPSTREAM_AI_TIMEOUT_MS", 30000);
  const pollIntervalMs = readIntEnv("KIE_AI_POLL_INTERVAL_MS", 3000);
  const pollTimeoutMs = getKiePollTimeoutMs(payload);
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
      error: `Prompt is required for ${payload.model.name}.`
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

    // Timeout is treated as a failure so the caller refunds the reserved credit.
    // The Kie task may still finish upstream; the task ID lets the client check later.
    return {
      success: false,
      data: redactProviderData({
        provider: "kie.ai",
        taskId,
        state: "pending",
        model: getKieProviderModel(payload),
        raw: latestData
      }),
      error: `Kie task did not complete before timeout. Reserved credit was refunded. Task ID: ${taskId}`
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

/**
 * Veo has a dedicated Kie API (POST /api/v1/veo/generate, poll
 * GET /api/v1/veo/record-info) that reports progress via successFlag
 * (0=processing, 1=success, 2/3=failed) instead of the jobs state field.
 */
async function callKieVeoProvider(payload: ProviderPayload): Promise<ProviderResult> {
  const apiKey = process.env.KIE_AI_API_KEY;
  const timeoutMs = readIntEnv("UPSTREAM_AI_TIMEOUT_MS", 30000);
  const pollIntervalMs = readIntEnv("KIE_AI_POLL_INTERVAL_MS", 3000);
  const pollTimeoutMs = getKiePollTimeoutMs(payload);
  const prompt = getPrompt(payload);

  if (!apiKey) {
    return {
      success: false,
      data: { error: "kie_provider_not_configured" },
      error: "Kie provider is not configured."
    };
  }

  if (!isValidProviderApiKey(apiKey)) {
    return {
      success: false,
      data: { error: "kie_provider_invalid_api_key" },
      error: "Kie provider API key is invalid or contains unsupported characters."
    };
  }

  if (!prompt) {
    return {
      success: false,
      data: { error: "kie_prompt_required" },
      error: `Prompt is required for ${payload.model.name}.`
    };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  const parameters = payload.request.parameters ?? {};
  const requestedRatio = getKieAspectRatio(payload);
  const aspectRatio = requestedRatio === "9:16" ? "9:16" : "16:9";
  const imageUrls = Array.isArray(parameters.image_urls)
    ? parameters.image_urls
    : Array.isArray(parameters.imageUrls)
      ? parameters.imageUrls
      : undefined;
  const callbackUrl = normalizeString(process.env.KIE_AI_CALLBACK_URL);

  try {
    const createResponse = await fetchWithTimeout(
      buildKieUrl("/api/v1/veo/generate"),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: payload.model.provider_model,
          prompt,
          aspectRatio,
          ...(imageUrls ? { imageUrls } : {}),
          ...(callbackUrl ? { callBackUrl: callbackUrl } : {})
        })
      },
      timeoutMs
    );
    const createData = redactProviderData(await parseProviderResponse(createResponse));

    if (!createResponse.ok) {
      return {
        success: false,
        data: createData,
        error: `Kie Veo provider failed with status ${createResponse.status}.`
      };
    }

    const createEnvelopeError = getKieEnvelopeError(createData);

    if (createEnvelopeError) {
      return { success: false, data: createData, error: createEnvelopeError };
    }

    const taskId = extractKieTaskId(createData);

    if (!taskId) {
      return {
        success: false,
        data: createData,
        error: "Kie Veo provider did not return a task ID."
      };
    }

    const startedAt = Date.now();
    let latestData: ProviderResult["data"] = createData;

    while (Date.now() - startedAt < pollTimeoutMs) {
      await sleep(pollIntervalMs);

      const detailResponse = await fetchWithTimeout(
        buildKieUrl(`/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`),
        { method: "GET", headers },
        timeoutMs
      );
      latestData = redactProviderData(await parseProviderResponse(detailResponse));

      if (!detailResponse.ok) {
        return {
          success: false,
          data: latestData,
          error: `Kie Veo task detail failed with status ${detailResponse.status}.`
        };
      }

      const detailEnvelopeError = getKieEnvelopeError(latestData);

      if (detailEnvelopeError) {
        return { success: false, data: latestData, error: detailEnvelopeError };
      }

      const taskData = extractKieTaskData(latestData);
      const successFlag = numberValue(taskData.successFlag);

      if (successFlag === 1) {
        const responseData = isRecord(taskData.response) ? taskData.response : taskData;
        const resultUrls = Array.from(collectStringUrls(responseData));
        const creditsConsumed =
          numberValue(taskData.creditsConsumed) ?? numberValue(taskData.credits_consumed);
        const data = redactProviderData({
          provider: "kie.ai",
          taskId,
          state: "success",
          model: payload.model.provider_model,
          result_urls: resultUrls,
          videos: resultUrls,
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

      if (successFlag === 2 || successFlag === 3) {
        return {
          success: false,
          data: latestData,
          error:
            normalizeString(taskData.errorMessage) ||
            normalizeString(taskData.error_message) ||
            "Kie Veo task failed."
        };
      }
    }

    // Timeout is a failure so the caller refunds the reserved credit; the task
    // may still finish on Kie's side — the ID lets the client check later.
    return {
      success: false,
      data: redactProviderData({
        provider: "kie.ai",
        taskId,
        state: "pending",
        model: payload.model.provider_model,
        raw: latestData
      }),
      error: `Kie Veo task did not complete before timeout. Reserved credit was refunded. Task ID: ${taskId}`
    };
  } catch (error) {
    return {
      success: false,
      data: { error: error instanceof Error ? error.message : "Kie Veo provider request failed." },
      error: error instanceof Error ? error.message : "Kie Veo provider request failed."
    };
  }
}

export async function callUpstreamProvider(
  payload: ProviderPayload
): Promise<ProviderResult> {
  if (isKieProvider(payload)) {
    return getKieFlow(payload) === "veo"
      ? callKieVeoProvider(payload)
      : callKieJobsProvider(payload);
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

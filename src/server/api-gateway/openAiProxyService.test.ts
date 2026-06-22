import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleOpenAiCompatibleChatCompletion } from "@/server/api-gateway/openAiProxyService";
import { POST as gatewayPost } from "@/app/api/gateway/chat/completions/route";
import { POST as v1Post } from "@/app/v1/chat/completions/route";
import { GET as modelsGet } from "@/app/v1/models/route";
import type { ApiClient, ApiModel } from "@/server/api-gateway/types";

const mocks = vi.hoisted(() => ({
  checkBudgetBeforeRequest: vi.fn(),
  checkRateLimit: vi.fn(),
  deductCredit: vi.fn(),
  refundCreditForRequest: vi.fn(),
  calculateCreditCost: vi.fn(),
  logUsage: vi.fn(),
  resolveModel: vi.fn(),
  validateClient: vi.fn(),
  supabase: null as unknown
}));

vi.mock("@/server/api-gateway/budgetService", () => ({
  checkBudgetBeforeRequest: mocks.checkBudgetBeforeRequest
}));

vi.mock("@/server/api-gateway/creditService", () => ({
  deductCredit: mocks.deductCredit,
  refundCreditForRequest: mocks.refundCreditForRequest
}));

vi.mock("@/server/api-gateway/gatewayService", () => ({
  calculateCreditCost: mocks.calculateCreditCost,
  logUsage: mocks.logUsage,
  resolveModel: mocks.resolveModel,
  validateClient: mocks.validateClient,
  processGatewayRequest: vi.fn()
}));

vi.mock("@/server/api-gateway/rateLimitService", () => ({
  checkRateLimit: mocks.checkRateLimit
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdminClient: () => mocks.supabase
}));

const client: ApiClient = {
  id: "client-id",
  name: "Hermes",
  api_key_hash: "hash",
  api_key_preview: "agf_live_test...test",
  status: "active",
  credit_balance: 1000,
  metadata: {},
  created_at: "2026-06-21T00:00:00.000Z",
  updated_at: "2026-06-21T00:00:00.000Z"
};

const model: ApiModel = {
  id: "model-id",
  name: "deepseek-v4-flash",
  provider: "deepseek",
  provider_model: "deepseek-v4-flash",
  credit_cost: 1,
  billing_type: "token",
  input_1k_token_price_mnt: 0,
  output_1k_token_price_mnt: 0,
  unit_price_mnt: 0,
  input_cache_hit_1m_token_price_usd: 0,
  input_cache_miss_1m_token_price_usd: 0,
  output_1m_token_price_usd: 0,
  unit_price_usd: 0,
  pricing_source_url: null,
  pricing_checked_at: null,
  status: "active",
  config: {},
  created_at: "2026-06-21T00:00:00.000Z",
  updated_at: "2026-06-21T00:00:00.000Z"
};

function createRequest(body: unknown) {
  return new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer agf_live_test",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

describe("OpenAI-compatible chat proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("UPSTREAM_AI_BASE_URL", "https://api.deepseek.com/v1");
    vi.stubEnv("UPSTREAM_AI_API_KEY", "sk-deepseek");
    mocks.checkBudgetBeforeRequest.mockResolvedValue({ allowed: true, estimatedCostUsd: 0.0001 });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, limit: 100 });
    mocks.deductCredit.mockResolvedValue({ balance_after: 999 });
    mocks.calculateCreditCost.mockReturnValue(1);
    mocks.resolveModel.mockResolvedValue(model);
    mocks.validateClient.mockResolvedValue(client);
  });

  it("reuses the existing chat route for /v1/chat/completions", () => {
    expect(v1Post).toBe(gatewayPost);
  });

  it("forwards OpenAI-compatible tool fields and returns tool_calls unchanged", async () => {
    const upstreamResponse = {
      id: "chatcmpl-tool",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "web_search",
                  arguments: "{\"query\":\"agentic tuslah\"}"
                }
              }
            ]
          },
          finish_reason: "tool_calls"
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12
      }
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(upstreamResponse), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const response = await handleOpenAiCompatibleChatCompletion(
      createRequest({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "search" }],
        tools: [
          {
            type: "function",
            function: {
              name: "web_search",
              parameters: { type: "object", properties: { query: { type: "string" } } }
            }
          }
        ],
        tool_choice: "auto",
        parallel_tool_calls: true,
        temperature: 0.2,
        max_tokens: 256,
        response_format: { type: "text" }
      })
    );

    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const data = await response.json();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(forwardedBody.tools[0].function.name).toBe("web_search");
    expect(forwardedBody.tool_choice).toBe("auto");
    expect(forwardedBody.parallel_tool_calls).toBe(true);
    expect(forwardedBody.temperature).toBe(0.2);
    expect(forwardedBody.max_tokens).toBe(256);
    expect(forwardedBody.response_format).toEqual({ type: "text" });
    expect(data).toEqual(upstreamResponse);
    expect(data.choices[0].message.tool_calls[0].function.name).toBe("web_search");
    expect(data.choices[0].finish_reason).toBe("tool_calls");
  });

  it("forwards stream=true and returns the upstream SSE body directly", async () => {
    const streamBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"delta\":\"ok\"}\n\n"));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(streamBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      })
    );

    const response = await handleOpenAiCompatibleChatCompletion(
      createRequest({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "stream" }],
        stream: true,
        stream_options: { include_usage: true }
      })
    );
    const forwardedBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(forwardedBody.stream).toBe(true);
    expect(forwardedBody.stream_options).toEqual({ include_usage: true });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    await expect(response.text()).resolves.toContain("data: [DONE]");
  });

  it("does not allow Kie.ai models through chat completions", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    mocks.resolveModel.mockResolvedValue({
      ...model,
      name: "gpt-image-2",
      provider: "kie.ai",
      provider_model: "gpt-image-2-text-to-image"
    });

    const response = await handleOpenAiCompatibleChatCompletion(
      createRequest({
        model: "gpt-image-2",
        messages: [{ role: "user", content: "make image" }]
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error.code).toBe("invalid_chat_model");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.deductCredit).not.toHaveBeenCalled();
  });

  it("returns an OpenAI-compatible /v1/models list without Kie.ai models", async () => {
    const queried: Array<{ column: string; value: string }> = [];
    mocks.supabase = {
      from(table: string) {
        expect(table).toBe("api_models");
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            queried.push({ column, value });
            return this;
          },
          neq(column: string, value: string) {
            queried.push({ column, value });
            return this;
          },
          order: async () => ({
            data: [
              {
                name: "deepseek-v4-flash",
                provider: "deepseek",
                created_at: "2026-06-21T00:00:00.000Z"
              }
            ],
            error: null
          })
        };
      }
    };

    const response = await modelsGet(
      new Request("http://localhost/v1/models", {
        headers: { Authorization: "Bearer agf_live_test" }
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      object: "list",
      data: [
        {
          id: "deepseek-v4-flash",
          object: "model",
          created: 1782000000,
          owned_by: "deepseek"
        }
      ]
    });
    expect(queried).toContainEqual({ column: "status", value: "active" });
    expect(queried).toContainEqual({ column: "provider", value: "kie.ai" });
  });
});

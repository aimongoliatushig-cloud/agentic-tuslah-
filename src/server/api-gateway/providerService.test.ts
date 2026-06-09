import { afterEach, describe, expect, it, vi } from "vitest";

import { callUpstreamProvider } from "@/server/api-gateway/providerService";
import type { ApiModel } from "@/server/api-gateway/types";

const model: ApiModel = {
  id: "model-id",
  name: "deepseek-chat",
  provider: "deepseek",
  provider_model: "deepseek-chat",
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
  created_at: "2026-06-09T00:00:00.000Z",
  updated_at: "2026-06-09T00:00:00.000Z"
};

const kieModel: ApiModel = {
  ...model,
  id: "kie-model-id",
  name: "gpt-image-2",
  provider: "kie.ai",
  provider_model: "gpt-image-2-text-to-image",
  credit_cost: 6,
  billing_type: "image",
  unit_price_usd: 0.005
};

describe("callUpstreamProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails cleanly when provider API key contains non-header characters", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTREAM_AI_API_KEY", "ТАНЫ_DEEPSEEK_KEY");
    vi.stubEnv("UPSTREAM_AI_BASE_URL", "https://api.deepseek.com");
    vi.stubEnv("UPSTREAM_AI_REQUEST_MODE", "openai-compatible");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await callUpstreamProvider({
      model,
      request: {
        model: "deepseek-chat",
        prompt: "hi"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Provider API key is invalid");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps usage token counts while redacting actual provider secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTREAM_AI_API_KEY", "sk-valid-ascii-key");
    vi.stubEnv("UPSTREAM_AI_BASE_URL", "https://api.deepseek.com");
    vi.stubEnv("UPSTREAM_AI_REQUEST_MODE", "openai-compatible");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          choices: [{ message: { content: "hello" } }],
          usage: {
            prompt_tokens: 123,
            completion_tokens: 45,
            total_tokens: 168,
            prompt_cache_hit_tokens: 100,
            prompt_cache_miss_tokens: 23
          },
          access_token: "provider-secret"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    const result = await callUpstreamProvider({
      model,
      request: {
        model: "deepseek-chat",
        prompt: "hi"
      }
    });

    expect(result.success).toBe(true);
    expect(result.inputTokens).toBe(123);
    expect(result.outputTokens).toBe(45);
    expect(result.totalTokens).toBe(168);
    expect(result.inputCacheHitTokens).toBe(100);
    expect(result.inputCacheMissTokens).toBe(23);
    expect((result.data as { access_token?: string }).access_token).toBe("[redacted]");
    expect(
      (result.data as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens
    ).toBe(123);
  });

  it("fails Kie GPT Image 2 without calling fetch when Kie API key is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KIE_AI_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await callUpstreamProvider({
      model: kieModel,
      request: {
        model: "gpt-image-2",
        prompt: "Create a product poster"
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Kie provider is not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates and polls a Kie GPT Image 2 task", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KIE_AI_API_KEY", "kie-valid-ascii-key");
    vi.stubEnv("KIE_AI_BASE_URL", "https://api.kie.ai");
    vi.stubEnv("KIE_AI_POLL_INTERVAL_MS", "1");
    vi.stubEnv("KIE_AI_POLL_TIMEOUT_MS", "50");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "task_gptimage_test"
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 200,
            msg: "success",
            data: {
              taskId: "task_gptimage_test",
              model: "gpt-image-2-text-to-image",
              state: "success",
              resultJson: JSON.stringify({
                resultUrls: ["https://cdn.example.com/generated.png"]
              }),
              creditsConsumed: 6
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
      );

    const result = await callUpstreamProvider({
      model: kieModel,
      request: {
        model: "gpt-image-2",
        prompt: "Create a clean SaaS dashboard concept",
        parameters: {
          aspect_ratio: "1:1"
        }
      }
    });

    expect(result.success).toBe(true);
    expect(result.imageCount).toBe(1);
    expect(result.billableUnits).toBe(6);
    expect((result.data as { output?: string }).output).toContain("https://cdn.example.com/generated.png");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.kie.ai/api/v1/jobs/createTask",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer kie-valid-ascii-key"
        }),
        body: JSON.stringify({
          model: "gpt-image-2-text-to-image",
          input: {
            prompt: "Create a clean SaaS dashboard concept",
            aspect_ratio: "1:1"
          }
        })
      })
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_gptimage_test"
    );
  });
});

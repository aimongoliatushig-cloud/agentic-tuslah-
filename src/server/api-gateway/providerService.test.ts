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
});

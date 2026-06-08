import { describe, expect, it } from "vitest";

import { estimateRequestCostUsd } from "@/server/api-gateway/budgetService";
import type { ApiModel } from "@/server/api-gateway/types";

const baseModel: ApiModel = {
  id: "model-id",
  name: "deepseek-chat",
  provider: "deepseek",
  provider_model: "deepseek-chat",
  credit_cost: 1,
  billing_type: "token",
  input_1k_token_price_mnt: 0,
  output_1k_token_price_mnt: 0,
  unit_price_mnt: 0,
  input_cache_hit_1m_token_price_usd: 0.0028,
  input_cache_miss_1m_token_price_usd: 0.14,
  output_1m_token_price_usd: 0.28,
  unit_price_usd: 0,
  pricing_source_url: "https://api-docs.deepseek.com/quick_start/pricing",
  pricing_checked_at: "2026-06-08T00:00:00.000Z",
  status: "active",
  config: {},
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z"
};

describe("estimateRequestCostUsd", () => {
  it("estimates token cost using input estimate and max_tokens", () => {
    const cost = estimateRequestCostUsd(baseModel, {
      model: "deepseek-chat",
      prompt: "x".repeat(400),
      parameters: { max_tokens: 100 }
    });

    expect(cost).toBeGreaterThan(0);
  });

  it("estimates image unit cost", () => {
    const cost = estimateRequestCostUsd(
      {
        ...baseModel,
        name: "nano-banana-2-1k",
        provider: "kie.ai",
        billing_type: "image",
        unit_price_usd: 0.04
      },
      {
        model: "nano-banana-2-1k",
        prompt: "make an image"
      }
    );

    expect(cost).toBe(0.04);
  });
});

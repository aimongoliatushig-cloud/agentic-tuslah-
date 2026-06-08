import { afterEach, describe, expect, it, vi } from "vitest";

import { generateApiKey, hashApiKey } from "@/server/api-gateway/apiKeyService";
import type { ApiClient, ApiModel } from "@/server/api-gateway/types";

const mocks = vi.hoisted(() => ({
  supabase: null as unknown,
  callUpstreamProvider: vi.fn(),
  deductCredit: vi.fn(),
  refundCreditForRequest: vi.fn(),
  checkBudgetBeforeRequest: vi.fn()
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdminClient: () => mocks.supabase
}));

vi.mock("@/server/api-gateway/providerService", () => ({
  callUpstreamProvider: mocks.callUpstreamProvider
}));

vi.mock("@/server/api-gateway/creditService", () => ({
  deductCredit: mocks.deductCredit,
  refundCreditForRequest: mocks.refundCreditForRequest
}));

vi.mock("@/server/api-gateway/budgetService", () => ({
  checkBudgetBeforeRequest: mocks.checkBudgetBeforeRequest
}));

function createGatewaySupabaseMock(params: {
  apiKey: string;
  client: ApiClient;
  model: ApiModel;
  usageLogs: unknown[];
}) {
  return {
    from(table: string) {
      if (table === "api_keys") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null })
        };
      }

      if (table === "api_clients") {
        const query = {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          then(resolve: (value: unknown) => void) {
            return Promise.resolve(
              resolve({
                data: [
                  {
                    ...params.client,
                    api_key_hash: hashApiKey(params.apiKey)
                  }
                ],
                error: null
              })
            );
          }
        };

        return query;
      }

      if (table === "api_models") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single: async () => ({ data: params.model, error: null })
        };
      }

      if (table === "api_usage_logs") {
        return {
          insert(payload: unknown) {
            params.usageLogs.push(payload);
            return {
              select() {
                return this;
              },
              single: async () => ({
                data: {
                  id: `usage-${params.usageLogs.length}`,
                  ...(payload as Record<string, unknown>)
                },
                error: null
              })
            };
          }
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  };
}

const baseClient: ApiClient = {
  id: "client-id",
  name: "Test Client",
  api_key_hash: "legacy",
  api_key_preview: "agf_live_test...test",
  status: "active",
  credit_balance: 1,
  metadata: {},
  created_at: "2026-06-08T00:00:00.000Z",
  updated_at: "2026-06-08T00:00:00.000Z"
};

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

describe("processGatewayRequest billing order", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the provider for concurrent requests that fail credit reservation", async () => {
    const { processGatewayRequest } = await import("@/server/api-gateway/gatewayService");
    const apiKey = generateApiKey();
    const usageLogs: unknown[] = [];
    let balance = 1;

    mocks.supabase = createGatewaySupabaseMock({
      apiKey,
      client: baseClient,
      model: baseModel,
      usageLogs
    });
    mocks.checkBudgetBeforeRequest.mockResolvedValue({ allowed: true, estimatedCostUsd: 0.0001 });
    mocks.callUpstreamProvider.mockResolvedValue({
      success: true,
      data: { output: "ok" },
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15
    });
    mocks.deductCredit.mockImplementation(async () => {
      await Promise.resolve();

      if (balance < 1) {
        throw new Error("Insufficient credit balance.");
      }

      balance -= 1;
      return {
        id: "tx-1",
        client_id: baseClient.id,
        amount: 1,
        type: "debit",
        balance_after: balance,
        note: null,
        metadata: {},
        created_at: "2026-06-08T00:00:00.000Z"
      };
    });

    const results = await Promise.allSettled([
      processGatewayRequest({ apiKey, payload: { model: baseModel.name, prompt: "one" } }),
      processGatewayRequest({ apiKey, payload: { model: baseModel.name, prompt: "two" } })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(mocks.deductCredit).toHaveBeenCalledTimes(2);
    expect(mocks.callUpstreamProvider).toHaveBeenCalledTimes(1);
    expect(usageLogs).toHaveLength(2);
    expect(
      usageLogs.filter(
        (log) => (log as { status?: string }).status === "success"
      )
    ).toHaveLength(1);
    expect(
      usageLogs.filter(
        (log) => (log as { status?: string }).status === "failed"
      )
    ).toHaveLength(1);
  });

  it("refunds reserved credit and logs failure when provider fails", async () => {
    const { processGatewayRequest } = await import("@/server/api-gateway/gatewayService");
    const apiKey = generateApiKey();
    const usageLogs: unknown[] = [];

    mocks.supabase = createGatewaySupabaseMock({
      apiKey,
      client: baseClient,
      model: baseModel,
      usageLogs
    });
    mocks.checkBudgetBeforeRequest.mockResolvedValue({ allowed: true, estimatedCostUsd: 0.0001 });
    mocks.deductCredit.mockResolvedValue({
      id: "tx-1",
      client_id: baseClient.id,
      amount: 1,
      type: "debit",
      balance_after: 0,
      note: null,
      metadata: {},
      created_at: "2026-06-08T00:00:00.000Z"
    });
    mocks.callUpstreamProvider.mockResolvedValue({
      success: false,
      data: { error: "upstream failed" },
      error: "upstream failed"
    });
    mocks.refundCreditForRequest.mockResolvedValue({
      id: "refund-1",
      client_id: baseClient.id,
      amount: 1,
      type: "credit",
      balance_after: 1,
      note: null,
      metadata: {},
      created_at: "2026-06-08T00:00:00.000Z"
    });

    await expect(
      processGatewayRequest({ apiKey, payload: { model: baseModel.name, prompt: "fail" } })
    ).rejects.toThrow("upstream failed");

    expect(mocks.deductCredit).toHaveBeenCalledBefore(mocks.callUpstreamProvider);
    expect(mocks.refundCreditForRequest).toHaveBeenCalledTimes(1);
    expect(usageLogs).toHaveLength(1);
    expect((usageLogs[0] as { status?: string; credit_cost?: number }).status).toBe("failed");
    expect((usageLogs[0] as { status?: string; credit_cost?: number }).credit_cost).toBe(0);
  });
});

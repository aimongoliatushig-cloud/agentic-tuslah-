import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { deductCredit, refundCreditForRequest } from "@/server/api-gateway/creditService";
import { callUpstreamProvider } from "@/server/api-gateway/providerService";
import { checkBudgetBeforeRequest } from "@/server/api-gateway/budgetService";
import { readNumberEnv } from "@/server/env";
import type {
  ApiClient,
  ApiModel,
  GatewayGeneratePayload,
  GatewayResult,
  ProviderResult
} from "@/server/api-gateway/types";
import type { Json } from "@/lib/database.types";
import { parseApiKey, verifyApiKey } from "@/server/api-gateway/apiKeyService";

const USAGE_EXHAUSTED_MESSAGE = "Таны хэрэглээ дууссан байна.";

export async function validateClient(apiKey: string) {
  const supabase = getSupabaseAdminClient();
  const parsedKey = parseApiKey(apiKey);

  if (parsedKey) {
    const { data: keyRow, error: keyError } = await supabase
      .from("api_keys")
      .select("id,client_id,key_hash,status,expires_at")
      .eq("key_id", parsedKey.keyId)
      .maybeSingle();

    if (keyError && !keyError.message.includes("api_keys")) {
      throw new Error(`Unable to validate API key: ${keyError.message}`);
    }

    if (keyRow) {
      const expired = keyRow.expires_at ? new Date(keyRow.expires_at) < new Date() : false;

      if (keyRow.status !== "active" || expired || !verifyApiKey(apiKey, keyRow.key_hash)) {
        return null;
      }

      const { data: client, error: clientError } = await supabase
        .from("api_clients")
        .select("*")
        .eq("id", keyRow.client_id)
        .eq("status", "active")
        .single();

      if (clientError) {
        return null;
      }

      supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id)
        .then(() => undefined);

      return client;
    }
  }

  const { data, error } = await supabase
    .from("api_clients")
    .select("*")
    .eq("status", "active");

  if (error) {
    throw new Error(`Unable to validate API key: ${error.message}`);
  }

  const client = data.find((item) => verifyApiKey(apiKey, item.api_key_hash));
  return client ?? null;
}

export async function resolveModel(modelName: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_models")
    .select("*")
    .eq("name", modelName)
    .eq("status", "active")
    .single();

  if (error) {
    return null;
  }

  return data;
}

export function calculateCreditCost(model: ApiModel) {
  const billingType = getBillingType(model);
  const usdToMntRate = readNumberEnv("API_GATEWAY_USD_TO_MNT_RATE", 0);
  const unitCount = Math.max(1, Number(model.credit_cost ?? 1));

  if (billingType === "image" || billingType === "request") {
    const unitMntPrice = Number(model.unit_price_mnt ?? 0);
    const unitUsdPrice = Number(model.unit_price_usd ?? 0);
    const amountMnt = unitMntPrice > 0 ? unitCount * unitMntPrice : unitCount * unitUsdPrice * usdToMntRate;

    if (amountMnt > 0) {
      return Math.max(1, Math.ceil(amountMnt));
    }
  }

  return model.credit_cost;
}

function roundMoney(value: number) {
  return Math.round(value * 10000) / 10000;
}

function getBillingType(model: ApiModel) {
  return model.billing_type ?? "credit";
}

function calculateUsageAccounting(model: ApiModel, providerResult: ProviderResult, creditCost: number) {
  const inputTokens = providerResult.inputTokens ?? null;
  const outputTokens = providerResult.outputTokens ?? null;
  const inputCacheHitTokens = providerResult.inputCacheHitTokens ?? null;
  const inputCacheMissTokens =
    providerResult.inputCacheMissTokens ??
    (inputTokens !== null && inputCacheHitTokens !== null
      ? Math.max(0, inputTokens - inputCacheHitTokens)
      : null);
  const totalTokens =
    providerResult.totalTokens ??
    (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  const billingType = getBillingType(model);
  const inputPrice = Number(model.input_1k_token_price_mnt ?? 0);
  const outputPrice = Number(model.output_1k_token_price_mnt ?? 0);
  const unitPrice = Number(model.unit_price_mnt ?? 0);
  const inputCacheHitUsdPrice = Number(model.input_cache_hit_1m_token_price_usd ?? 0);
  const inputCacheMissUsdPrice = Number(model.input_cache_miss_1m_token_price_usd ?? 0);
  const outputUsdPrice = Number(model.output_1m_token_price_usd ?? 0);
  const unitUsdPrice = Number(model.unit_price_usd ?? 0);
  const imageUnits =
    providerResult.billableUnits ?? providerResult.imageCount ?? (billingType === "image" ? 1 : 0);
  const billableUnits =
    billingType === "token"
      ? totalTokens ?? 0
      : billingType === "image"
        ? imageUnits
        : billingType === "request"
          ? 1
          : creditCost;
  const tokenInputCost = ((inputTokens ?? 0) / 1000) * inputPrice;
  const tokenOutputCost = ((outputTokens ?? 0) / 1000) * outputPrice;
  const inputCacheHitCostUsd = ((inputCacheHitTokens ?? 0) / 1_000_000) * inputCacheHitUsdPrice;
  const inputCacheMissCostUsd =
    ((inputCacheMissTokens ?? inputTokens ?? 0) / 1_000_000) * inputCacheMissUsdPrice;
  const outputCostUsd = ((outputTokens ?? 0) / 1_000_000) * outputUsdPrice;
  const directCostMnt =
    billingType === "token"
      ? tokenInputCost + tokenOutputCost
      : billingType === "image"
        ? billableUnits * unitPrice
        : billingType === "request"
        ? unitPrice
        : creditCost * unitPrice;
  const costUsd =
    billingType === "token"
      ? inputCacheHitCostUsd + inputCacheMissCostUsd + outputCostUsd
      : billableUnits * unitUsdPrice;
  const usdToMntRate = readNumberEnv("API_GATEWAY_USD_TO_MNT_RATE", 0);
  const convertedCostMnt = costUsd * usdToMntRate;
  const costMnt = directCostMnt > 0 ? directCostMnt : convertedCostMnt;
  const costBreakdown: Json = {
    billingType,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCacheHitTokens,
    inputCacheMissTokens,
    billableUnits,
    prices: {
      input1kTokenMnt: inputPrice,
      output1kTokenMnt: outputPrice,
      unitMnt: unitPrice,
      inputCacheHit1mTokenUsd: inputCacheHitUsdPrice,
      inputCacheMiss1mTokenUsd: inputCacheMissUsdPrice,
      output1mTokenUsd: outputUsdPrice,
      unitUsd: unitUsdPrice,
      usdToMntRate,
      pricingSourceUrl: model.pricing_source_url,
      pricingCheckedAt: model.pricing_checked_at
    },
    tokenInputCostMnt: roundMoney(tokenInputCost),
    tokenOutputCostMnt: roundMoney(tokenOutputCost),
    inputCacheHitCostUsd: roundMoney(inputCacheHitCostUsd),
    inputCacheMissCostUsd: roundMoney(inputCacheMissCostUsd),
    outputCostUsd: roundMoney(outputCostUsd),
    totalCostUsd: roundMoney(costUsd),
    totalCostMnt: roundMoney(costMnt)
  };

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCacheHitTokens,
    inputCacheMissTokens,
    billableUnits,
    costUsd: roundMoney(costUsd),
    costMnt: roundMoney(costMnt),
    costBreakdown
  };
}

export async function forwardToProvider(payload: {
  model: ApiModel;
  request: GatewayGeneratePayload;
}) {
  return callUpstreamProvider(payload);
}

export async function logUsage(params: {
  client: ApiClient;
  model: ApiModel;
  requestId: string;
  status: "success" | "failed";
  creditCost: number;
  providerResult: ProviderResult;
  latencyMs: number;
}) {
  const supabase = getSupabaseAdminClient();
  const usageAccounting = calculateUsageAccounting(
    params.model,
    params.providerResult,
    params.creditCost
  );
  const { data, error } = await supabase
    .from("api_usage_logs")
    .insert({
      client_id: params.client.id,
      model_id: params.model.id,
      request_id: params.requestId,
      status: params.status,
      credit_cost: params.creditCost,
      input_tokens: usageAccounting.inputTokens,
      output_tokens: usageAccounting.outputTokens,
      total_tokens: usageAccounting.totalTokens,
      input_cache_hit_tokens: usageAccounting.inputCacheHitTokens,
      input_cache_miss_tokens: usageAccounting.inputCacheMissTokens,
      billable_units: usageAccounting.billableUnits,
      cost_mnt: usageAccounting.costMnt,
      cost_usd: usageAccounting.costUsd,
      estimated_cost_usd:
        typeof params.providerResult.data === "object" &&
        params.providerResult.data &&
        !Array.isArray(params.providerResult.data) &&
        "estimatedCostUsd" in params.providerResult.data &&
        typeof params.providerResult.data.estimatedCostUsd === "number"
          ? params.providerResult.data.estimatedCostUsd
          : usageAccounting.costUsd,
      cost_breakdown: usageAccounting.costBreakdown,
      latency_ms: params.latencyMs,
      provider_response: params.providerResult.data,
      error_message: params.providerResult.error ?? null
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Unable to log API usage: ${error.message}`);
  }

  return data;
}

export async function processGatewayRequest(params: {
  apiKey: string;
  payload: GatewayGeneratePayload;
}): Promise<GatewayResult> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const client = await validateClient(params.apiKey);

  if (!client) {
    throw new Error("Invalid or inactive API key.");
  }

  const model = await resolveModel(params.payload.model);

  if (!model) {
    throw new Error("Requested model is unavailable.");
  }

  const creditCost = calculateCreditCost(model);
  const budgetCheck = await checkBudgetBeforeRequest({
    client,
    model,
    payload: params.payload
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
        error: USAGE_EXHAUSTED_MESSAGE
      },
      latencyMs: Date.now() - startedAt
    });

    throw new Error(USAGE_EXHAUSTED_MESSAGE);
  }

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
        data: {
          reason: "credit_reservation_failed",
          requiredCredit: creditCost
        },
        error: message.includes("Insufficient") ? USAGE_EXHAUSTED_MESSAGE : message
      },
      latencyMs: Date.now() - startedAt
    });

    throw new Error(message.includes("Insufficient") ? USAGE_EXHAUSTED_MESSAGE : message);
  }

  const providerResult = await forwardToProvider({
    model,
    request: params.payload
  });
  const latencyMs = Date.now() - startedAt;

  if (!providerResult.success) {
    let refundError: string | null = null;

    try {
      await refundCreditForRequest(
        client.id,
        creditCost,
        requestId,
        `Gateway refund ${requestId} for failed ${model.name}`
      );
    } catch (error) {
      refundError = error instanceof Error ? error.message : "Unable to refund reserved credit.";
    }

    await logUsage({
      client,
      model,
      requestId,
      status: "failed",
      creditCost: 0,
      providerResult: refundError
        ? {
            ...providerResult,
            data: {
              provider: providerResult.data,
              refundError
            }
          }
        : providerResult,
      latencyMs
    });

    if (refundError) {
      throw new Error(`Provider request failed and credit refund failed: ${refundError}`);
    }

    throw new Error(providerResult.error ?? "Provider request failed.");
  }

  await logUsage({
    client,
    model,
    requestId,
    status: "success",
    creditCost,
    providerResult,
    latencyMs
  });

  const usageAccounting = calculateUsageAccounting(model, providerResult, creditCost);

  return {
    requestId,
    model: model.name,
    creditCost,
    balanceAfter: transaction.balance_after,
    usage: {
      inputTokens: usageAccounting.inputTokens,
      outputTokens: usageAccounting.outputTokens,
      totalTokens: usageAccounting.totalTokens,
      inputCacheHitTokens: usageAccounting.inputCacheHitTokens,
      inputCacheMissTokens: usageAccounting.inputCacheMissTokens,
      billableUnits: usageAccounting.billableUnits,
      costUsd: usageAccounting.costUsd,
      costMnt: usageAccounting.costMnt
    },
    provider: providerResult.data
  };
}

import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { deductCredit, refundCreditForRequest } from "@/server/api-gateway/creditService";
import { GatewayError } from "@/server/api-gateway/errors";
import { reserveInflightBudget } from "@/server/api-gateway/inflightBudget";
import { callUpstreamProvider } from "@/server/api-gateway/providerService";
import { redactProviderData } from "@/server/api-gateway/providerRedact";
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
import { hashApiKey, parseApiKey, verifyApiKey } from "@/server/api-gateway/apiKeyService";

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

  // Legacy keys (no api_keys row) are stored as a SHA-256 hash directly on the
  // client, so we can look them up via the unique api_key_hash index instead of
  // scanning every active client.
  const { data: legacyClient, error } = await supabase
    .from("api_clients")
    .select("*")
    .eq("api_key_hash", hashApiKey(apiKey))
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to validate API key: ${error.message}`);
  }

  return legacyClient ?? null;
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
  const estimatedCostUsd =
    typeof params.providerResult.data === "object" &&
    params.providerResult.data &&
    !Array.isArray(params.providerResult.data) &&
    "estimatedCostUsd" in params.providerResult.data &&
    typeof params.providerResult.data.estimatedCostUsd === "number"
      ? params.providerResult.data.estimatedCostUsd
      : usageAccounting.costUsd;
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
      estimated_cost_usd: estimatedCostUsd,
      cost_breakdown: usageAccounting.costBreakdown,
      latency_ms: params.latencyMs,
      provider_response: redactProviderData(params.providerResult.data),
      error_message: params.providerResult.error ?? null
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Unable to log API usage: ${error.message}`);
  }

  return data;
}

/**
 * Metered models (token- and unit/image-billed) reserve an estimated
 * `credit_cost` up front because the real usage is unknown until the provider
 * answers. Once actual token counts / billable units are in, this settles the
 * difference: refunds when the reservation was too high, charges extra when it
 * was too low. Failures here never break the request — the reservation simply
 * stands as the final charge. "credit"-billed models have no metered cost
 * (costMnt = 0) and are skipped by the guard below.
 */
export async function reconcileReservedCredit(params: {
  client: ApiClient;
  model: ApiModel;
  providerResult: ProviderResult;
  reservedCredit: number;
  requestId: string;
}): Promise<{ finalCreditCost: number; balanceAfter: number | null }> {
  const { client, model, providerResult, reservedCredit, requestId } = params;

  const accounting = calculateUsageAccounting(model, providerResult, reservedCredit);

  if (accounting.costMnt <= 0) {
    return { finalCreditCost: reservedCredit, balanceAfter: null };
  }

  const actualCredit = Math.max(1, Math.ceil(accounting.costMnt));

  try {
    if (actualCredit < reservedCredit) {
      const refund = await refundCreditForRequest(
        client.id,
        reservedCredit - actualCredit,
        requestId,
        `Gateway reconciliation refund ${requestId} for ${model.name}`
      );
      return { finalCreditCost: actualCredit, balanceAfter: refund.balance_after };
    }

    if (actualCredit > reservedCredit) {
      const charge = await deductCredit(
        client.id,
        actualCredit - reservedCredit,
        `Gateway reconciliation charge ${requestId} for ${model.name}`,
        `${requestId}-adjust`
      );
      return { finalCreditCost: actualCredit, balanceAfter: charge.balance_after };
    }
  } catch (error) {
    console.error("[api-gateway] credit reconciliation failed", {
      requestId,
      clientId: client.id,
      reservedCredit,
      actualCredit,
      error: error instanceof Error ? error.message : error
    });
  }

  return { finalCreditCost: reservedCredit, balanceAfter: null };
}

export async function processGatewayRequest(params: {
  apiKey: string;
  payload: GatewayGeneratePayload;
}): Promise<GatewayResult> {
  const client = await validateClient(params.apiKey);

  if (!client) {
    throw new GatewayError("Invalid or inactive API key.", 401, "unauthorized");
  }

  return processGatewayRequestForClient({ client, payload: params.payload });
}

/**
 * Same billing pipeline as processGatewayRequest, but for callers that have
 * already authenticated the client through another channel (e.g. the admin
 * studio, where only the key HASH exists so the raw key cannot be replayed).
 */
export async function processGatewayRequestForClient(params: {
  client: ApiClient;
  payload: GatewayGeneratePayload;
}): Promise<GatewayResult> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const client = params.client;

  const model = await resolveModel(params.payload.model);

  if (!model) {
    throw new GatewayError("Requested model is unavailable.", 404, "model_unavailable");
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

    throw new GatewayError(USAGE_EXHAUSTED_MESSAGE, 402, "usage_exhausted");
  }

  // Count this request's estimate against concurrent budget checks until its
  // cost lands in api_usage_logs (released in the finally below).
  const releaseBudget = reserveInflightBudget(client.id, budgetCheck.estimatedCostUsd);

  try {
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

      if (message.includes("Insufficient")) {
        throw new GatewayError(USAGE_EXHAUSTED_MESSAGE, 402, "usage_exhausted");
      }

      throw new GatewayError(message, 400, "gateway_error");
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

    const reconciliation = await reconcileReservedCredit({
      client,
      model,
      providerResult,
      reservedCredit: creditCost,
      requestId
    });

    try {
      await logUsage({
        client,
        model,
        requestId,
        status: "success",
        creditCost: reconciliation.finalCreditCost,
        providerResult,
        latencyMs
      });
    } catch (error) {
      // The provider already answered and credit is settled — logging must not
      // turn a successful request into a client-facing failure.
      console.error("[api-gateway] failed to log successful usage", {
        requestId,
        error: error instanceof Error ? error.message : error
      });
    }

    const usageAccounting = calculateUsageAccounting(model, providerResult, reconciliation.finalCreditCost);

    return {
      requestId,
      model: model.name,
      creditCost: reconciliation.finalCreditCost,
      balanceAfter: reconciliation.balanceAfter ?? transaction.balance_after,
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
  } finally {
    releaseBudget();
  }
}

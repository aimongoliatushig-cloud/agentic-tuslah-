import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getInflightBudgetUsd } from "@/server/api-gateway/inflightBudget";
import type { ApiClient, ApiModel, GatewayGeneratePayload } from "@/server/api-gateway/types";

type BudgetLimit = {
  id: string;
  scope_type: "total" | "provider" | "model";
  scope_key: string;
  period: "daily" | "weekly" | "monthly" | "lifetime";
  limit_usd: number;
};

type SpendAggregate = {
  model_id: string;
  model_name: string;
  provider: string;
  total_cost_usd: number;
};

type UsageSpendRow = {
  model_id: string;
  cost_usd: number;
  api_models?: {
    name: string;
    provider: string;
  } | null;
};

function roundUsd(value: number) {
  return Math.round(value * 100000000) / 100000000;
}

// Period boundaries are computed in UTC so limits behave the same regardless
// of the server's local timezone.
function periodStart(period: BudgetLimit["period"]) {
  const now = new Date();

  if (period === "lifetime") {
    return null;
  }

  if (period === "daily") {
    now.setUTCHours(0, 0, 0, 0);
    return now.toISOString();
  }

  if (period === "weekly") {
    const day = now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1;
    now.setUTCDate(now.getUTCDate() - day);
    now.setUTCHours(0, 0, 0, 0);
    return now.toISOString();
  }

  now.setUTCDate(1);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}

function readTextFromPayload(payload: GatewayGeneratePayload) {
  if (payload.prompt) {
    return payload.prompt;
  }

  if (!payload.input || typeof payload.input !== "object" || Array.isArray(payload.input)) {
    return "";
  }

  const input = payload.input as Record<string, unknown>;
  if (!Array.isArray(input.messages)) {
    return JSON.stringify(input);
  }

  return input.messages
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === "object")
    .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")))
    .join("\n");
}

function estimateInputTokens(payload: GatewayGeneratePayload) {
  return Math.ceil(readTextFromPayload(payload).length / 4);
}

function estimateOutputTokens(payload: GatewayGeneratePayload) {
  const maxTokens = payload.parameters?.max_tokens ?? payload.parameters?.maxTokens;
  return typeof maxTokens === "number" && Number.isFinite(maxTokens) ? maxTokens : 1024;
}

function estimateBillableUnits(model: ApiModel) {
  if (model.billing_type === "image" || model.billing_type === "request") {
    return Math.max(1, Number(model.credit_cost ?? 1));
  }

  return model.credit_cost;
}

export function estimateRequestCostUsd(model: ApiModel, payload: GatewayGeneratePayload) {
  if (model.billing_type === "token") {
    const inputTokens = estimateInputTokens(payload);
    const outputTokens = estimateOutputTokens(payload);
    const inputCost =
      (inputTokens / 1_000_000) * Number(model.input_cache_miss_1m_token_price_usd ?? 0);
    const outputCost = (outputTokens / 1_000_000) * Number(model.output_1m_token_price_usd ?? 0);
    return roundUsd(inputCost + outputCost);
  }

  return roundUsd(estimateBillableUnits(model) * Number(model.unit_price_usd ?? 0));
}

function matchesScope(limit: BudgetLimit, model: ApiModel) {
  if (limit.scope_type === "total") {
    return true;
  }

  if (limit.scope_type === "provider") {
    return limit.scope_key === model.provider;
  }

  return limit.scope_key === model.name || limit.scope_key === model.id;
}

function spentForScope(limit: BudgetLimit, rows: SpendAggregate[], model: ApiModel) {
  return rows
    .filter((row) => {
      if (limit.scope_type === "total") {
        return true;
      }

      if (limit.scope_type === "provider") {
        return row.provider === model.provider;
      }

      return row.model_id === model.id || row.model_name === model.name;
    })
    .reduce((sum, row) => sum + Number(row.total_cost_usd ?? 0), 0);
}

// Fallback for environments where the sum_usage_costs RPC has not been applied
// yet: fetch the raw rows and aggregate per model in memory.
async function getSpendAggregatesFromRows(
  clientId: string,
  start: string | null
): Promise<SpendAggregate[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("api_usage_logs")
    .select("model_id,cost_usd,api_models(name,provider)")
    .eq("client_id", clientId)
    .eq("status", "success");

  if (start) {
    query = query.gte("created_at", start);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to read budget usage: ${error.message}`);
  }

  const aggregates = new Map<string, SpendAggregate>();

  for (const row of (data ?? []) as UsageSpendRow[]) {
    const existing = aggregates.get(row.model_id);

    if (existing) {
      existing.total_cost_usd += Number(row.cost_usd ?? 0);
      continue;
    }

    aggregates.set(row.model_id, {
      model_id: row.model_id,
      model_name: row.api_models?.name ?? "",
      provider: row.api_models?.provider ?? "",
      total_cost_usd: Number(row.cost_usd ?? 0)
    });
  }

  return Array.from(aggregates.values());
}

async function getSpendAggregates(
  clientId: string,
  period: BudgetLimit["period"]
): Promise<SpendAggregate[]> {
  const supabase = getSupabaseAdminClient();
  const start = periodStart(period);
  const { data, error } = await supabase.rpc("sum_usage_costs", {
    p_client_id: clientId,
    p_since: start
  });

  if (error) {
    return getSpendAggregatesFromRows(clientId, start);
  }

  return ((data ?? []) as SpendAggregate[]).map((row) => ({
    ...row,
    total_cost_usd: Number(row.total_cost_usd ?? 0)
  }));
}

export async function checkBudgetBeforeRequest(params: {
  client: ApiClient;
  model: ApiModel;
  payload: GatewayGeneratePayload;
}) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_client_budget_limits")
    .select("id,scope_type,scope_key,period,limit_usd")
    .eq("client_id", params.client.id)
    .eq("status", "active");

  if (error) {
    throw new Error(`Unable to read budget limits: ${error.message}`);
  }

  const relevantLimits = ((data ?? []) as BudgetLimit[]).filter((limit) =>
    matchesScope(limit, params.model)
  );
  const estimatedCostUsd = estimateRequestCostUsd(params.model, params.payload);
  // Estimated cost of requests that passed this check but are not logged yet;
  // without it concurrent requests could all slip under the limit together.
  const inflightUsd = getInflightBudgetUsd(params.client.id);
  const aggregatesByPeriod = new Map<BudgetLimit["period"], SpendAggregate[]>();

  for (const limit of relevantLimits) {
    let rows = aggregatesByPeriod.get(limit.period);

    if (!rows) {
      rows = await getSpendAggregates(params.client.id, limit.period);
      aggregatesByPeriod.set(limit.period, rows);
    }

    const spentUsd = spentForScope(limit, rows, params.model);
    const projectedUsd = spentUsd + inflightUsd + estimatedCostUsd;

    if (projectedUsd > Number(limit.limit_usd)) {
      return {
        allowed: false,
        estimatedCostUsd,
        scopeType: limit.scope_type,
        scopeKey: limit.scope_key,
        period: limit.period,
        limitUsd: Number(limit.limit_usd),
        spentUsd: roundUsd(spentUsd),
        projectedUsd: roundUsd(projectedUsd)
      };
    }
  }

  return {
    allowed: true,
    estimatedCostUsd
  };
}

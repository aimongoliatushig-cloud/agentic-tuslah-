import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import type { ApiClient, ApiModel, GatewayGeneratePayload } from "@/server/api-gateway/types";

type BudgetLimit = {
  id: string;
  scope_type: "total" | "provider" | "model";
  scope_key: string;
  period: "daily" | "weekly" | "monthly" | "lifetime";
  limit_usd: number;
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

function periodStart(period: BudgetLimit["period"]) {
  const now = new Date();

  if (period === "lifetime") {
    return null;
  }

  if (period === "daily") {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  if (period === "weekly") {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }

  now.setDate(1);
  now.setHours(0, 0, 0, 0);
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
    return 1;
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

function spentForScope(limit: BudgetLimit, rows: UsageSpendRow[], model: ApiModel) {
  return rows
    .filter((row) => {
      if (limit.scope_type === "total") {
        return true;
      }

      if (limit.scope_type === "provider") {
        return row.api_models?.provider === model.provider;
      }

      return row.model_id === model.id || row.api_models?.name === model.name;
    })
    .reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
}

async function getSpendRows(clientId: string, period: BudgetLimit["period"]) {
  const supabase = getSupabaseAdminClient();
  const start = periodStart(period);
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

  return (data ?? []) as UsageSpendRow[];
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

  for (const limit of relevantLimits) {
    const rows = await getSpendRows(params.client.id, limit.period);
    const spentUsd = spentForScope(limit, rows, params.model);
    const projectedUsd = spentUsd + estimatedCostUsd;

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

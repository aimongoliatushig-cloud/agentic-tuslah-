import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { readNumberEnv } from "@/server/env";
import type { ApiClient, ApiKey, ApiModel, ApiUsageLog } from "@/server/api-gateway/types";
import type { Database, Json } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export function getUsdToMntRate() {
  return readNumberEnv("API_GATEWAY_USD_TO_MNT_RATE", 0);
}

/** Converts a USD amount to MNT using the configured cost rate (0 if rate is unset). */
export function usdToMnt(valueUsd: number) {
  return valueUsd * getUsdToMntRate();
}

/** Customer-facing (retail) USD→MNT rate. Higher than the cost rate; the gap is the markup. */
export function getRetailUsdToMntRate() {
  return readNumberEnv("API_GATEWAY_RETAIL_USD_TO_MNT_RATE", 10000);
}

/**
 * Markup multiplier applied to internal cost-MNT figures to get the customer's
 * retail price. retailRate / costRate (falls back to 1 if the cost rate is unset).
 */
export function getRetailMarkup() {
  const costRate = getUsdToMntRate();

  if (costRate <= 0) {
    return 1;
  }

  const retailRate = getRetailUsdToMntRate();
  return retailRate > 0 ? retailRate / costRate : 1;
}

/** Converts an internal cost-MNT amount to the customer-facing retail-MNT amount. */
export function toRetailMnt(costMnt: number) {
  return costMnt * getRetailMarkup();
}

export type CreditTransaction =
  Database["public"]["Tables"]["api_credit_transactions"]["Row"];

export interface NamedTransaction extends CreditTransaction {
  clientName: string;
}

export interface NamedUsageLog extends ApiUsageLog {
  clientName: string;
  modelName: string;
  modelType: string;
}

export interface AdminClient extends ApiClient {
  apiKeys: ApiKey[];
  monthSpentMnt: number;
  totalBudgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  usageUsedPercent: number;
  usageRemainingPercent: number;
  deepseekBudgetUsd: number;
  deepseekSpentUsd: number;
  deepseekRemainingPercent: number;
  kieBudgetUsd: number;
  kieSpentUsd: number;
  kieRemainingPercent: number;
}

export interface GatewayAdminData {
  clients: AdminClient[];
  models: ApiModel[];
  transactions: NamedTransaction[];
  usageLogs: NamedUsageLog[];
  stats: {
    totalClients: number;
    activeClients: number;
    totalCreditBalance: number;
    totalBudgetRemainingUsd: number;
    totalBudgetLimitUsd: number;
    totalBudgetRemainingMnt: number;
    totalBudgetLimitMnt: number;
    todayRequests: number;
    monthRequests: number;
    estimatedRevenue: number;
    totalTokens: number;
    totalCostMnt: number;
    totalCostUsd: number;
    totalBillableUnits: number;
    topClient: string;
    topModel: string;
    creditValue: number;
  };
  charts: {
    usageGrowth: ChartPoint[];
    dailyRequests: ChartPoint[];
    creditSpend: ChartPoint[];
    revenue: ChartPoint[];
    modelUsage: ChartPoint[];
    heatmap: HeatmapCell[];
  };
  leaders: {
    topCustomers: LeaderRow[];
    topModels: LeaderRow[];
  };
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface HeatmapCell {
  day: string;
  hour: string;
  value: number;
}

export interface LeaderRow {
  name: string;
  value: number;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function getJsonRecord(value: Json): { [key: string]: Json | undefined } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return {};
}

export function getClientEmail(client: ApiClient) {
  const metadata = getJsonRecord(client.metadata);
  const email = metadata.email;
  return typeof email === "string" ? email : "";
}

export function getModelType(model: ApiModel) {
  const config = getJsonRecord(model.config);
  const type = config.type;
  return typeof type === "string" ? type : "Text";
}

function toMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function sumBy<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

function countBy<T>(items: T[], pick: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = pick(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function money(value: number) {
  return Math.round(value);
}

function percentRemaining(spent: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, ((limit - spent) / limit) * 100));
}

function percentUsed(spent: number, limit: number) {
  if (limit <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (spent / limit) * 100));
}

function buildRecentSeries(logs: ApiUsageLog[], days = 14) {
  const result: ChartPoint[] = [];
  const now = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const value = logs.filter((log) => {
      const createdAt = new Date(log.created_at);
      return createdAt >= start && createdAt < end;
    }).length;
    result.push({
      label: new Intl.DateTimeFormat("mn-MN", { day: "numeric" }).format(date),
      value
    });
  }

  return result;
}

function buildCreditSeries(logs: ApiUsageLog[]) {
  const byDay = new Map<string, number>();
  for (const log of logs.filter((item) => item.status === "success")) {
    const key = dateKey(log.created_at);
    byDay.set(key, (byDay.get(key) ?? 0) + log.credit_cost);
  }
  return Array.from(byDay.entries())
    .slice(-14)
    .map(([label, value]) => ({ label, value }));
}

function buildCostSeries(logs: ApiUsageLog[]) {
  const byDay = new Map<string, number>();
  for (const log of logs.filter((item) => item.status === "success")) {
    const key = dateKey(log.created_at);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(log.cost_mnt ?? 0));
  }
  return Array.from(byDay.entries())
    .slice(-14)
    .map(([label, value]) => ({ label, value: money(value) }));
}

function buildModelUsage(logs: NamedUsageLog[]) {
  return Array.from(countBy(logs, (log) => log.modelName).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

function buildLeaders(logs: NamedUsageLog[], key: "clientName" | "modelName") {
  return Array.from(countBy(logs, (log) => log[key]).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }));
}

function buildHeatmap(logs: ApiUsageLog[]) {
  const days = ["Дав", "Мяг", "Лха", "Пүр", "Баа", "Бям", "Ням"];
  const hours = ["00", "04", "08", "12", "16", "20"];
  return days.flatMap((day, dayIndex) =>
    hours.map((hour) => ({
      day,
      hour,
      value: logs.filter((log) => {
        const date = new Date(log.created_at);
        const jsDay = date.getDay() === 0 ? 6 : date.getDay() - 1;
        return jsDay === dayIndex && Math.floor(date.getHours() / 4) * 4 === Number(hour);
      }).length
    }))
  );
}

export async function getGatewayAdminData(): Promise<GatewayAdminData> {
  const supabase = getSupabaseAdminClient();
  const [
    { data: clients },
    { data: models },
    { data: transactions },
    { data: usageLogs },
    { data: budgets },
    { data: apiKeys }
  ] =
    await Promise.all([
      supabase.from("api_clients").select("*").order("created_at", { ascending: false }),
      supabase.from("api_models").select("*").order("created_at", { ascending: false }),
      supabase
        .from("api_credit_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("api_usage_logs").select("*").order("created_at", { ascending: false }).limit(500),
      supabase
        .from("api_client_budget_limits")
        .select("*")
        .eq("status", "active"),
      supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false })
    ]);

  const rawClients = clients ?? [];
  const safeModels = models ?? [];
  const safeTransactions = transactions ?? [];
  const safeUsageLogs = usageLogs ?? [];
  const safeBudgets = budgets ?? [];
  const safeApiKeys = apiKeys ?? [];
  const successfulLogs = safeUsageLogs.filter((log) => log.status === "success");
  const monthStartTime = startOfMonth().getTime();
  const rawModelMap = toMap(safeModels);
  const safeClients = rawClients.map((client) => {
    const clientApiKeys = safeApiKeys.filter((key) => key.client_id === client.id);
    const monthSpentMnt = sumBy(
      successfulLogs.filter(
        (log) => log.client_id === client.id && new Date(log.created_at).getTime() >= monthStartTime
      ),
      (log) => Number(log.cost_mnt ?? 0)
    );
    const clientBudgets = safeBudgets.filter((budget) => budget.client_id === client.id);
    const totalBudgetUsd =
      Number(
        clientBudgets.find((budget) => budget.scope_type === "total" && budget.scope_key === "*")
          ?.limit_usd
      ) || 0;
    const deepseekBudgetUsd =
      Number(
        clientBudgets.find(
          (budget) => budget.scope_type === "provider" && budget.scope_key === "deepseek"
        )?.limit_usd
      ) || 0;
    const kieBudgetUsd =
      Number(
        clientBudgets.find(
          (budget) => budget.scope_type === "provider" && budget.scope_key === "kie.ai"
        )?.limit_usd
      ) || 0;
    const spentUsd = sumBy(
      successfulLogs.filter((log) => log.client_id === client.id),
      (log) => Number(log.cost_usd ?? 0)
    );
    const deepseekSpentUsd = sumBy(
      successfulLogs.filter(
        (log) => log.client_id === client.id && rawModelMap.get(log.model_id)?.provider === "deepseek"
      ),
      (log) => Number(log.cost_usd ?? 0)
    );
    const kieSpentUsd = sumBy(
      successfulLogs.filter(
        (log) => log.client_id === client.id && rawModelMap.get(log.model_id)?.provider === "kie.ai"
      ),
      (log) => Number(log.cost_usd ?? 0)
    );

    return {
      ...client,
      apiKeys: clientApiKeys,
      monthSpentMnt: money(monthSpentMnt),
      totalBudgetUsd,
      spentUsd,
      remainingUsd: Math.max(0, totalBudgetUsd - spentUsd),
      usageUsedPercent: percentUsed(spentUsd, totalBudgetUsd),
      usageRemainingPercent: percentRemaining(spentUsd, totalBudgetUsd),
      deepseekBudgetUsd,
      deepseekSpentUsd,
      deepseekRemainingPercent: percentRemaining(deepseekSpentUsd, deepseekBudgetUsd),
      kieBudgetUsd,
      kieSpentUsd,
      kieRemainingPercent: percentRemaining(kieSpentUsd, kieBudgetUsd)
    };
  });
  const clientMap = toMap(safeClients);
  const modelMap = toMap(safeModels);

  const namedTransactions = safeTransactions.map((transaction) => ({
    ...transaction,
    clientName: clientMap.get(transaction.client_id)?.name ?? "Тодорхойгүй"
  }));

  const namedUsageLogs = safeUsageLogs.map((log) => {
    const model = modelMap.get(log.model_id);
    return {
      ...log,
      clientName: clientMap.get(log.client_id)?.name ?? "Тодорхойгүй",
      modelName: model?.name ?? "Тодорхойгүй",
      modelType: model ? getModelType(model) : "Text"
    };
  });

  const today = startOfToday();
  const month = startOfMonth();
  const deductedCredits = sumBy(successfulLogs, (log) => log.credit_cost);
  const totalTokens = sumBy(successfulLogs, (log) => log.total_tokens ?? 0);
  const totalBillableUnits = sumBy(successfulLogs, (log) => Number(log.billable_units ?? 0));
  const totalCostMnt = sumBy(successfulLogs, (log) => Number(log.cost_mnt ?? 0));
  const totalCostUsd = sumBy(successfulLogs, (log) => Number(log.cost_usd ?? 0));
  const creditValue = Number(process.env.API_GATEWAY_CREDIT_VALUE ?? "1000");
  const topCustomers = buildLeaders(namedUsageLogs, "clientName");
  const topModels = buildLeaders(namedUsageLogs, "modelName");

  return {
    clients: safeClients,
    models: safeModels,
    transactions: namedTransactions,
    usageLogs: namedUsageLogs,
    stats: {
      totalClients: safeClients.length,
      activeClients: safeClients.filter((client) => client.status === "active").length,
      totalCreditBalance: sumBy(safeClients, (client) => client.credit_balance),
      totalBudgetRemainingUsd: sumBy(safeClients, (client) => client.remainingUsd),
      totalBudgetLimitUsd: sumBy(safeClients, (client) => client.totalBudgetUsd),
      totalBudgetRemainingMnt: money(usdToMnt(sumBy(safeClients, (client) => client.remainingUsd))),
      totalBudgetLimitMnt: money(usdToMnt(sumBy(safeClients, (client) => client.totalBudgetUsd))),
      todayRequests: safeUsageLogs.filter((log) => new Date(log.created_at) >= today).length,
      monthRequests: safeUsageLogs.filter((log) => new Date(log.created_at) >= month).length,
      estimatedRevenue: money(totalCostMnt || deductedCredits * (Number.isFinite(creditValue) ? creditValue : 1000)),
      totalTokens,
      totalCostMnt: money(totalCostMnt),
      totalCostUsd,
      totalBillableUnits,
      topClient: topCustomers[0]?.name ?? "Одоогоор байхгүй",
      topModel: topModels[0]?.name ?? "Одоогоор байхгүй",
      creditValue: Number.isFinite(creditValue) ? creditValue : 1000
    },
    charts: {
      usageGrowth: buildRecentSeries(safeUsageLogs),
      dailyRequests: buildRecentSeries(safeUsageLogs, 7),
      creditSpend: buildCreditSeries(safeUsageLogs),
      revenue: buildCostSeries(safeUsageLogs),
      modelUsage: buildModelUsage(namedUsageLogs),
      heatmap: buildHeatmap(safeUsageLogs)
    },
    leaders: {
      topCustomers,
      topModels
    }
  };
}

export interface GenerationItem {
  id: string;
  createdAt: string;
  clientName: string;
  modelName: string;
  costMnt: number;
  urls: string[];
}

function extractMediaUrls(value: Json): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, Json>;
  const urls = new Set<string>();

  for (const key of ["result_urls", "videos", "images"]) {
    const list = record[key];

    if (!Array.isArray(list)) {
      continue;
    }

    for (const item of list) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) {
        urls.add(item);
      }
    }
  }

  return Array.from(urls);
}

/** Recent successful Kie.ai generations (images/videos) with their media URLs. */
export async function getRecentGenerations(limit = 48): Promise<GenerationItem[]> {
  const supabase = getSupabaseAdminClient();
  const { data: models } = await supabase.from("api_models").select("id,name,provider");
  const kieModelIds = (models ?? [])
    .filter((model) => model.provider.toLowerCase() === "kie.ai")
    .map((model) => model.id);

  if (kieModelIds.length === 0) {
    return [];
  }

  const [{ data: logs }, { data: clients }] = await Promise.all([
    supabase
      .from("api_usage_logs")
      .select("id,client_id,model_id,created_at,cost_mnt,provider_response")
      .eq("status", "success")
      .in("model_id", kieModelIds)
      .order("created_at", { ascending: false })
      .limit(limit * 2),
    supabase.from("api_clients").select("id,name")
  ]);
  const clientNames = new Map((clients ?? []).map((client) => [client.id, client.name]));
  const modelNames = new Map((models ?? []).map((model) => [model.id, model.name]));
  const items: GenerationItem[] = [];

  for (const log of logs ?? []) {
    const urls = extractMediaUrls(log.provider_response);

    if (urls.length === 0) {
      continue;
    }

    items.push({
      id: log.id,
      createdAt: log.created_at,
      clientName: clientNames.get(log.client_id) ?? "—",
      modelName: modelNames.get(log.model_id) ?? "—",
      costMnt: Number(log.cost_mnt ?? 0),
      urls
    });

    if (items.length >= limit) {
      break;
    }
  }

  return items;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN").format(value);
}

export function formatMoneyMnt(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 0,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2
  }).format(value)}₮`;
}

export function formatMoneyUsd(value: number) {
  return `$${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
    maximumFractionDigits: 8
  }).format(value)}`;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

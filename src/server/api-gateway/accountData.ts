import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  getClientEmail,
  getModelType,
  getRetailMarkup,
  getRetailUsdToMntRate
} from "@/server/api-gateway/adminData";
import type { ApiClient, ApiKey, ApiModel, ApiUsageLog } from "@/server/api-gateway/types";
import type { Database } from "@/lib/database.types";

/** Finds an active client whose registered email matches (case-insensitive). */
export async function findActiveClientByEmail(email: string): Promise<ApiClient | null> {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("api_clients").select("*").eq("status", "active");

  if (error) {
    return null;
  }

  return (data ?? []).find((client) => getClientEmail(client).toLowerCase() === normalized) ?? null;
}

type RawTransaction = Database["public"]["Tables"]["api_credit_transactions"]["Row"];

export interface AccountTransaction extends RawTransaction {
  /** Customer-facing retail amount (internal cost amount × markup). */
  retailAmount: number;
  retailBalanceAfter: number;
}

export interface AccountUsageLog extends ApiUsageLog {
  modelName: string;
  modelType: string;
  /** Customer-facing retail cost for this request. */
  retailCostMnt: number;
}

export interface ClientAccountData {
  client: ApiClient;
  /** All MNT figures below are customer-facing retail amounts. */
  balanceMnt: number;
  monthSpentMnt: number;
  totalSpentMnt: number;
  totalRequests: number;
  monthRequests: number;
  totalTokens: number;
  successRate: number;
  retailUsdToMntRate: number;
  apiKeys: ApiKey[];
  usageLogs: AccountUsageLog[];
  transactions: AccountTransaction[];
  modelUsage: { label: string; value: number }[];
  dailyRequests: { label: string; value: number }[];
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sumBy<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

function buildModelUsage(logs: AccountUsageLog[]) {
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.modelName, (counts.get(log.modelName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

function buildDailyRequests(logs: ApiUsageLog[], days = 14) {
  const result: { label: string; value: number }[] = [];
  const now = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = new Date(now);
    start.setDate(now.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    const value = logs.filter((log) => {
      const created = new Date(log.created_at);
      return created >= start && created < end;
    }).length;
    result.push({
      label: new Intl.DateTimeFormat("mn-MN", { day: "numeric" }).format(start),
      value
    });
  }

  return result;
}

export async function getClientAccountData(clientId: string): Promise<ClientAccountData | null> {
  const supabase = getSupabaseAdminClient();
  const { data: client, error: clientError } = await supabase
    .from("api_clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return null;
  }

  const [{ data: models }, { data: usageLogs }, { data: apiKeys }, { data: transactions }] =
    await Promise.all([
      supabase.from("api_models").select("*"),
      supabase
        .from("api_usage_logs")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("api_keys")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("api_credit_transactions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(50)
    ]);

  const safeModels = (models ?? []) as ApiModel[];
  const safeLogs = (usageLogs ?? []) as ApiUsageLog[];
  const modelMap = new Map(safeModels.map((model) => [model.id, model]));
  const markup = getRetailMarkup();
  const toRetail = (value: number) => Math.round(value * markup);

  const namedLogs: AccountUsageLog[] = safeLogs.map((log) => {
    const model = modelMap.get(log.model_id);
    return {
      ...log,
      modelName: model?.name ?? "Тодорхойгүй",
      modelType: model ? getModelType(model) : "Text",
      retailCostMnt: toRetail(Number(log.cost_mnt ?? 0))
    };
  });

  const successfulLogs = namedLogs.filter((log) => log.status === "success");
  const monthStartTime = startOfMonth().getTime();
  const monthLogs = namedLogs.filter((log) => new Date(log.created_at).getTime() >= monthStartTime);
  const monthSuccessful = monthLogs.filter((log) => log.status === "success");

  const namedTransactions: AccountTransaction[] = ((transactions ?? []) as RawTransaction[]).map(
    (transaction) => ({
      ...transaction,
      retailAmount: toRetail(Number(transaction.amount ?? 0)),
      retailBalanceAfter: toRetail(Number(transaction.balance_after ?? 0))
    })
  );

  return {
    client,
    balanceMnt: toRetail(Number(client.credit_balance ?? 0)),
    monthSpentMnt: toRetail(sumBy(monthSuccessful, (log) => Number(log.cost_mnt ?? 0))),
    totalSpentMnt: toRetail(sumBy(successfulLogs, (log) => Number(log.cost_mnt ?? 0))),
    totalRequests: namedLogs.length,
    monthRequests: monthLogs.length,
    totalTokens: sumBy(successfulLogs, (log) => Number(log.total_tokens ?? 0)),
    successRate:
      namedLogs.length > 0 ? Math.round((successfulLogs.length / namedLogs.length) * 1000) / 10 : 100,
    retailUsdToMntRate: getRetailUsdToMntRate(),
    apiKeys: (apiKeys ?? []) as ApiKey[],
    usageLogs: namedLogs.slice(0, 50),
    transactions: namedTransactions,
    modelUsage: buildModelUsage(successfulLogs),
    dailyRequests: buildDailyRequests(safeLogs)
  };
}

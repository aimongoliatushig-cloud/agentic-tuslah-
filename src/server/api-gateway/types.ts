import type { Database, Json } from "@/lib/database.types";

export type ApiClient = Database["public"]["Tables"]["api_clients"]["Row"];
export type ApiModel = Database["public"]["Tables"]["api_models"]["Row"];
export type ApiCreditTransaction =
  Database["public"]["Tables"]["api_credit_transactions"]["Row"];
export type ApiUsageLog = Database["public"]["Tables"]["api_usage_logs"]["Row"];

export interface GatewayGeneratePayload {
  model: string;
  prompt?: string;
  input?: Json;
  parameters?: Record<string, unknown>;
}

export interface ProviderPayload {
  model: ApiModel;
  request: GatewayGeneratePayload;
}

export interface ProviderResult {
  success: boolean;
  data: Json;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputCacheHitTokens?: number;
  inputCacheMissTokens?: number;
  imageCount?: number;
  billableUnits?: number;
}

export interface GatewayResult {
  requestId: string;
  model: string;
  creditCost: number;
  balanceAfter: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    inputCacheHitTokens: number | null;
    inputCacheMissTokens: number | null;
    billableUnits: number;
    costUsd: number;
    costMnt: number;
  };
  provider: Json;
}

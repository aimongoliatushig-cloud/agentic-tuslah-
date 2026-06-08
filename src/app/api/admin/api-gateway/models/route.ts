import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

interface CreateModelBody {
  name?: string;
  provider?: string;
  providerModel?: string;
  creditCost?: number;
  billingType?: "credit" | "token" | "image" | "request";
  input1kTokenPriceMnt?: number;
  output1kTokenPriceMnt?: number;
  unitPriceMnt?: number;
  inputCacheHit1mTokenPriceUsd?: number;
  inputCacheMiss1mTokenPriceUsd?: number;
  output1mTokenPriceUsd?: number;
  unitPriceUsd?: number;
  pricingSourceUrl?: string;
  status?: "active" | "inactive";
  config?: Json;
}

export async function GET(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_models")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ models: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to list models.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const body = await readJson<CreateModelBody>(request);

    if (!body.name || !body.providerModel) {
      return jsonError("Model name and providerModel are required.", 400);
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_models")
      .insert({
        name: body.name,
        provider: body.provider ?? "upstream",
        provider_model: body.providerModel,
        credit_cost: body.creditCost ?? 1,
        billing_type: body.billingType ?? "credit",
        input_1k_token_price_mnt: body.input1kTokenPriceMnt ?? 0,
        output_1k_token_price_mnt: body.output1kTokenPriceMnt ?? 0,
        unit_price_mnt: body.unitPriceMnt ?? 0,
        input_cache_hit_1m_token_price_usd: body.inputCacheHit1mTokenPriceUsd ?? 0,
        input_cache_miss_1m_token_price_usd: body.inputCacheMiss1mTokenPriceUsd ?? 0,
        output_1m_token_price_usd: body.output1mTokenPriceUsd ?? 0,
        unit_price_usd: body.unitPriceUsd ?? 0,
        pricing_source_url: body.pricingSourceUrl ?? null,
        pricing_checked_at: body.pricingSourceUrl ? new Date().toISOString() : null,
        status: body.status ?? "active",
        config: body.config ?? {}
      })
      .select()
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ model: data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create model.", 500);
  }
}

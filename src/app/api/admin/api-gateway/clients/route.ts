import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createApiKeyPreview,
  generateApiKey,
  hashApiKey
} from "@/server/api-gateway/apiKeyService";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";
import type { Json } from "@/lib/database.types";
import { writeAdminAuditLog } from "@/server/adminAudit";

export const runtime = "nodejs";

interface CreateClientBody {
  name?: string;
  initialCredit?: number;
  metadata?: Json;
}

export async function GET(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_clients")
      .select("id,name,api_key_preview,status,credit_balance,metadata,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ clients: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to list clients.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const body = await readJson<CreateClientBody>(request);

    if (!body.name) {
      return jsonError("Client name is required.", 400);
    }

    const apiKey = generateApiKey();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_clients")
      .insert({
        name: body.name,
        api_key_hash: hashApiKey(apiKey),
        api_key_preview: createApiKeyPreview(apiKey),
        credit_balance: body.initialCredit ?? 0,
        metadata: body.metadata ?? {}
      })
      .select("id,name,api_key_preview,status,credit_balance,metadata,created_at,updated_at")
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    const keyId = apiKey.split("_")[2];
    const { error: keyError } = await supabase.from("api_keys").insert({
      client_id: data.id,
      key_id: keyId,
      key_hash: hashApiKey(apiKey),
      key_preview: createApiKeyPreview(apiKey),
      status: "active"
    });

    const { error: budgetError } = await supabase.from("api_client_budget_limits").insert([
      {
        client_id: data.id,
        scope_type: "total",
        scope_key: "*",
        period: "lifetime",
        limit_usd: 10,
        metadata: { default: true, source: "admin-api" }
      },
      {
        client_id: data.id,
        scope_type: "provider",
        scope_key: "deepseek",
        period: "lifetime",
        limit_usd: 5,
        metadata: { default: true, source: "admin-api" }
      },
      {
        client_id: data.id,
        scope_type: "provider",
        scope_key: "kie.ai",
        period: "lifetime",
        limit_usd: 5,
        metadata: { default: true, source: "admin-api" }
      }
    ]);

    await writeAdminAuditLog({
      request,
      action: "api_client.create",
      entityType: "api_client",
      entityId: data.id,
      after: data
    });

    return jsonOk(
      {
        client: data,
        apiKey,
        keyWarning: keyError?.message,
        budgetWarning: budgetError?.message
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create client.", 500);
  }
}

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createApiKeyPreview,
  generateApiKey,
  hashApiKey,
  parseApiKey
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
    const parsedKey = parseApiKey(apiKey);

    if (!parsedKey) {
      return jsonError("Unable to create API key.", 500);
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.rpc("create_api_client_with_key", {
      p_name: body.name,
      p_api_key_hash: hashApiKey(apiKey),
      p_api_key_preview: createApiKeyPreview(apiKey),
      p_key_id: parsedKey.keyId,
      p_initial_credit: body.initialCredit ?? 0,
      p_metadata: body.metadata ?? {},
      p_default_budget_limits: [
        {
          scope_type: "total",
          scope_key: "*",
          period: "lifetime",
          limit_usd: 10,
          metadata: { default: true, source: "admin-api" }
        },
        {
          scope_type: "provider",
          scope_key: "deepseek",
          period: "lifetime",
          limit_usd: 5,
          metadata: { default: true, source: "admin-api" }
        },
        {
          scope_type: "provider",
          scope_key: "kie.ai",
          period: "lifetime",
          limit_usd: 5,
          metadata: { default: true, source: "admin-api" }
        }
      ]
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    const client = data?.[0];

    if (!client) {
      return jsonError("Unable to create client.", 500);
    }

    await writeAdminAuditLog({
      request,
      action: "api_client.create",
      entityType: "api_client",
      entityId: client.id,
      after: client
    });

    return jsonOk(
      {
        client,
        apiKey
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create client.", 500);
  }
}

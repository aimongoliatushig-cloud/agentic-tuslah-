import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createApiKeyPreview,
  generateApiKey,
  hashApiKey
} from "@/server/api-gateway/apiKeyService";
import { jsonError, jsonOk, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id } = await context.params;
    const apiKey = generateApiKey();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_clients")
      .update({
        api_key_hash: hashApiKey(apiKey),
        api_key_preview: createApiKeyPreview(apiKey),
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id,name,api_key_preview,status,credit_balance,metadata,created_at,updated_at")
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({
      client: data,
      apiKey
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to regenerate key.", 500);
  }
}

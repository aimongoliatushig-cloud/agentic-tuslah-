import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateApiKey, hashApiKey } from "@/server/api-gateway/apiKeyService";
import { writeAdminAuditLog } from "@/server/adminAudit";
import { jsonError, jsonOk, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; keyId: string }> }
) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id, keyId } = await context.params;
    const supabase = getSupabaseAdminClient();

    const { data: clientBefore, error: clientError } = await supabase
      .from("api_clients")
      .select("id,name,api_key_preview,status,credit_balance,metadata")
      .eq("id", id)
      .single();

    if (clientError) {
      return jsonError("Client not found.", 404, "client_not_found");
    }

    const { data: keyBefore, error: keyError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("id", keyId)
      .eq("client_id", id)
      .maybeSingle();

    if (keyError) {
      return jsonError(keyError.message, 500, "key_lookup_failed");
    }

    if (!keyBefore) {
      return jsonError("API key not found or already deleted.", 404, "key_not_found");
    }

    const { error: deleteError } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", keyId)
      .eq("client_id", id);

    if (deleteError) {
      return jsonError(deleteError.message, 500, "key_delete_failed");
    }

    const { data: replacementKey, error: replacementError } = await supabase
      .from("api_keys")
      .select("key_hash,key_preview")
      .eq("client_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (replacementError) {
      return jsonError(replacementError.message, 500, "replacement_key_lookup_failed");
    }

    const tombstoneKey = generateApiKey();
    const clientKeyUpdate = replacementKey
      ? {
          api_key_hash: replacementKey.key_hash,
          api_key_preview: replacementKey.key_preview,
          updated_at: new Date().toISOString()
        }
      : {
          api_key_hash: hashApiKey(tombstoneKey),
          api_key_preview: "устгасан түлхүүр",
          updated_at: new Date().toISOString()
        };

    const { data: clientAfter, error: clientUpdateError } = await supabase
      .from("api_clients")
      .update(clientKeyUpdate)
      .eq("id", id)
      .select("id,name,api_key_preview,status,credit_balance,metadata")
      .single();

    if (clientUpdateError) {
      return jsonError(clientUpdateError.message, 500, "client_key_sync_failed");
    }

    await writeAdminAuditLog({
      request,
      action: "api_key.delete",
      entityType: "api_key",
      entityId: keyId,
      before: {
        client: clientBefore,
        key: {
          id: keyBefore.id,
          key_id: keyBefore.key_id,
          key_preview: keyBefore.key_preview,
          status: keyBefore.status,
          created_at: keyBefore.created_at
        }
      },
      after: {
        client: clientAfter,
        replacementApplied: Boolean(replacementKey)
      }
    });

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to delete API key.", 500);
  }
}

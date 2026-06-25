import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { writeAdminAuditLog } from "@/server/adminAudit";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

const CLIENT_SELECT = "id,name,api_key_preview,status,credit_balance,metadata,created_at,updated_at";

interface UpdateClientBody {
  name?: string;
  email?: string;
}

function asMetadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id } = await context.params;
    const body = await readJson<UpdateClientBody>(request);

    const supabase = getSupabaseAdminClient();
    const { data: before, error: beforeError } = await supabase
      .from("api_clients")
      .select(CLIENT_SELECT)
      .eq("id", id)
      .single();

    if (beforeError) {
      return jsonError(beforeError.message, 404, "client_not_found");
    }

    const updates: { name?: string; metadata?: Json } = {};

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }

    if (body.email !== undefined) {
      const metadata = asMetadataRecord(before.metadata);
      metadata.email = String(body.email).trim();
      updates.metadata = metadata as Json;
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("Шинэчлэх утга алга.", 400, "nothing_to_update");
    }

    const { data: client, error } = await supabase
      .from("api_clients")
      .update(updates)
      .eq("id", id)
      .select(CLIENT_SELECT)
      .single();

    if (error) {
      return jsonError(error.message, 500, "client_update_failed");
    }

    await writeAdminAuditLog({
      request,
      action: "api_client.update",
      entityType: "api_client",
      entityId: id,
      before,
      after: client
    });

    return jsonOk({ client });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update client.", 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id } = await context.params;
    const supabase = getSupabaseAdminClient();
    const { data: before, error: beforeError } = await supabase
      .from("api_clients")
      .select(CLIENT_SELECT)
      .eq("id", id)
      .single();

    if (beforeError) {
      return jsonError(beforeError.message, 404, "client_not_found");
    }

    // Remove dependent rows first so the delete succeeds regardless of FK setup.
    await supabase.from("api_client_budget_limits").delete().eq("client_id", id);
    await supabase.from("api_keys").delete().eq("client_id", id);
    await supabase.from("api_usage_logs").delete().eq("client_id", id);
    await supabase.from("api_credit_transactions").delete().eq("client_id", id);

    const { error } = await supabase.from("api_clients").delete().eq("id", id);

    if (error) {
      return jsonError(error.message, 500, "client_delete_failed");
    }

    await writeAdminAuditLog({
      request,
      action: "api_client.delete",
      entityType: "api_client",
      entityId: id,
      before
    });

    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to delete client.", 500);
  }
}

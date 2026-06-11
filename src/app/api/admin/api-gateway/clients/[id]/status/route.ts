import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { writeAdminAuditLog } from "@/server/adminAudit";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

const allowedStatuses = new Set(["active", "suspended", "disabled"]);
type ClientStatus = "active" | "suspended" | "disabled";

interface UpdateClientStatusBody {
  status?: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id } = await context.params;
    const body = await readJson<UpdateClientStatusBody>(request);

    if (!body.status || !allowedStatuses.has(body.status)) {
      return jsonError("Valid client status is required.", 400, "invalid_status");
    }

    const status = body.status as ClientStatus;
    const supabase = getSupabaseAdminClient();
    const { data: before, error: beforeError } = await supabase
      .from("api_clients")
      .select("id,name,status,credit_balance,metadata,api_key_preview")
      .eq("id", id)
      .single();

    if (beforeError) {
      return jsonError(beforeError.message, 404, "client_not_found");
    }

    const { data: client, error } = await supabase
      .from("api_clients")
      .update({ status })
      .eq("id", id)
      .select("id,name,api_key_preview,status,credit_balance,metadata,created_at,updated_at")
      .single();

    if (error) {
      return jsonError(error.message, 500, "status_update_failed");
    }

    await writeAdminAuditLog({
      request,
      action: "api_client.update_status",
      entityType: "api_client",
      entityId: id,
      before,
      after: client
    });

    return jsonOk({ client });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to update client status.", 500);
  }
}

import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { verifyAdminRequest } from "@/server/adminAuth";
import type { Json } from "@/lib/database.types";

export async function writeAdminAuditLog(params: {
  request: Request;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Json | null;
  after?: Json | null;
}) {
  const auth = verifyAdminRequest(params.request);
  const supabase = getSupabaseAdminClient();

  if (!auth.ok) {
    return;
  }

  await supabase.from("admin_audit_logs").insert({
    admin_subject: auth.subject,
    admin_role: auth.role,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    ip: params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: params.request.headers.get("user-agent"),
    request_id: crypto.randomUUID()
  });
}

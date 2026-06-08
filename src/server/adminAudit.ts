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

export async function writeAdminLoginAuditLog(params: {
  request: Request;
  success: boolean;
  reason?: string;
}) {
  const supabase = getSupabaseAdminClient();

  await supabase.from("admin_audit_logs").insert({
    admin_subject: params.success ? "admin-token" : "anonymous",
    admin_role: params.success ? "owner" : "unknown",
    action: params.success ? "admin.login.success" : "admin.login.failed",
    entity_type: "admin_session",
    entity_id: null,
    before: null,
    after: {
      success: params.success,
      reason: params.reason ?? null
    },
    ip: params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: params.request.headers.get("user-agent"),
    request_id: crypto.randomUUID()
  });
}

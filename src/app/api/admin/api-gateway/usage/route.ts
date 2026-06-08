import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { jsonError, jsonOk, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_usage_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Number.isFinite(limit) ? Math.min(limit, 200) : 50);

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ usage: data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to list usage.", 500);
  }
}

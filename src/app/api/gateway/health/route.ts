import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { jsonOk } from "@/server/http";
import { getProviderRuntimeConfig } from "@/server/api-gateway/providerService";

export const runtime = "nodejs";

async function checkDatabaseConnection() {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from("api_clients")
      .select("id")
      .limit(1);

    return !error;
  } catch {
    return false;
  }
}

export async function GET() {
  const databaseConnected = await checkDatabaseConnection();
  const providerConfig = getProviderRuntimeConfig();

  return jsonOk({
    status: databaseConnected ? "ok" : "degraded",
    database_connected: databaseConnected,
    mock_provider_mode: providerConfig.mockProviderMode,
    provider_ready: providerConfig.providerReady,
    kie_provider_ready: providerConfig.kieProviderReady,
    provider_request_mode: providerConfig.requestMode,
    provider_timeout_ms: providerConfig.timeoutMs,
    timestamp: new Date().toISOString()
  });
}

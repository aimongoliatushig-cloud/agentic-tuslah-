import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { extractMediaUrls } from "@/server/api-gateway/adminData";
import { GatewayError } from "@/server/api-gateway/errors";
import { processGatewayRequestForClient } from "@/server/api-gateway/gatewayService";
import { validateGatewayGeneratePayload } from "@/server/api-gateway/validation";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

interface StudioGenerateBody {
  clientId?: string;
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  duration?: string;
}

export async function POST(request: Request) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const body = await readJson<StudioGenerateBody>(request);

    if (!body.clientId || !body.model || !body.prompt?.trim()) {
      return jsonError("clientId, model, prompt шаардлагатай.", 400, "invalid_request");
    }

    const supabase = getSupabaseAdminClient();
    const { data: client, error } = await supabase
      .from("api_clients")
      .select("*")
      .eq("id", body.clientId)
      .eq("status", "active")
      .maybeSingle();

    if (error || !client) {
      return jsonError("Идэвхтэй хэрэглэгч олдсонгүй.", 404, "client_not_found");
    }

    const parameters: Record<string, unknown> = {
      aspect_ratio: body.aspectRatio?.trim() || "auto"
    };

    if (body.duration?.trim()) {
      parameters.duration = body.duration.trim();
    }

    const validation = validateGatewayGeneratePayload({
      model: body.model,
      prompt: body.prompt.trim(),
      parameters
    });

    if (!validation.ok) {
      return jsonError("Invalid studio request.", 400, "invalid_request", validation.details);
    }

    const result = await processGatewayRequestForClient({
      client,
      payload: validation.payload
    });
    const urls = extractMediaUrls(result.provider);

    if (urls.length === 0) {
      return jsonError("Provider ямар ч media буцаасангүй.", 502, "generation_failed");
    }

    return jsonOk({
      requestId: result.requestId,
      model: result.model,
      creditCost: result.creditCost,
      balanceAfter: result.balanceAfter,
      urls
    });
  } catch (error) {
    if (error instanceof GatewayError) {
      return jsonError(error.message, error.status, error.code);
    }

    const message = error instanceof Error ? error.message : "Studio generation failed.";
    return jsonError(message, 400, "studio_error");
  }
}

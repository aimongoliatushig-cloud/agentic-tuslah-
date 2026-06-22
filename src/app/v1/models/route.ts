import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { validateClient } from "@/server/api-gateway/gatewayService";
import { jsonError } from "@/server/http";

export const runtime = "nodejs";

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function toOpenAiModel(row: {
  name: string;
  provider: string;
  created_at?: string | null;
}) {
  return {
    id: row.name,
    object: "model",
    created: row.created_at ? Math.floor(new Date(row.created_at).getTime() / 1000) : 0,
    owned_by: row.provider
  };
}

export async function GET(request: Request) {
  try {
    const apiKey = readBearerToken(request);

    if (!apiKey) {
      return jsonError("Missing Authorization: Bearer CLIENT_API_KEY header.", 401, "unauthorized");
    }

    const client = await validateClient(apiKey);

    if (!client) {
      return jsonError("Invalid or inactive API key.", 401, "unauthorized");
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("api_models")
      .select("name,provider,created_at,status")
      .eq("status", "active")
      .neq("provider", "kie.ai")
      .order("created_at", { ascending: false });

    if (error) {
      return jsonError(error.message, 500);
    }

    const models =
      data && data.length > 0
        ? data.map(toOpenAiModel)
        : [toOpenAiModel({ name: "deepseek-v4-flash", provider: "deepseek", created_at: null })];

    return Response.json({
      object: "list",
      data: models
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to list models.", 500);
  }
}

import { jsonError } from "@/server/http";

export const runtime = "nodejs";

export async function GET() {
  return jsonError(
    "Kie.ai status tool endpoint is reserved for a dedicated tool flow and is not wired yet.",
    501,
    "kie_status_tool_not_implemented"
  );
}

export async function POST() {
  return GET();
}

import { jsonError } from "@/server/http";

export const runtime = "nodejs";

export async function POST() {
  return jsonError(
    "Kie.ai image tool endpoint is reserved for a dedicated tool flow and is not wired yet.",
    501,
    "kie_image_tool_not_implemented"
  );
}

import { jsonError } from "@/server/http";

export const runtime = "nodejs";

export async function POST() {
  return jsonError(
    "Kie.ai video tool endpoint is reserved for a dedicated tool flow and is not wired yet.",
    501,
    "kie_video_tool_not_implemented"
  );
}

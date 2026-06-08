import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { readIntEnv } from "@/server/env";

function hashLimiterKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function windowStart(windowSeconds: number) {
  const now = Date.now();
  return new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000).toISOString();
}

export async function checkRateLimit(params: {
  apiKey?: string | null;
  ip?: string | null;
  route: string;
}) {
  const limit = readIntEnv("API_GATEWAY_RATE_LIMIT_REQUESTS", 60);
  const windowSeconds = Math.max(1, readIntEnv("API_GATEWAY_RATE_LIMIT_WINDOW_SECONDS", 60));
  const keyMaterial = params.apiKey ? `key:${params.apiKey}` : `ip:${params.ip ?? "unknown"}`;
  const key = `${params.route}:${hashLimiterKey(keyMaterial)}`;
  const start = windowStart(windowSeconds);
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_window_start: start
  });

  if (error) {
    throw new Error(`Unable to increment rate limit: ${error.message}`);
  }

  const nextCount = data?.[0]?.count ?? 0;
  const retryAfter = Math.max(1, Math.ceil((Date.parse(start) + windowSeconds * 1000 - Date.now()) / 1000));

  return {
    allowed: nextCount <= limit,
    limit,
    count: nextCount,
    retryAfter
  };
}

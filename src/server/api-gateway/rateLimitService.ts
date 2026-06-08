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

  const { data: existing, error: readError } = await supabase
    .from("api_rate_limits")
    .select("id,count")
    .eq("key", key)
    .eq("window_start", start)
    .maybeSingle();

  if (readError) {
    throw new Error(`Unable to read rate limit: ${readError.message}`);
  }

  const nextCount = (existing?.count ?? 0) + 1;

  if (existing) {
    const { error } = await supabase
      .from("api_rate_limits")
      .update({ count: nextCount })
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Unable to update rate limit: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("api_rate_limits").insert({
      key,
      window_start: start,
      count: nextCount
    });

    if (error) {
      throw new Error(`Unable to create rate limit: ${error.message}`);
    }
  }

  const retryAfter = Math.max(1, Math.ceil((Date.parse(start) + windowSeconds * 1000 - Date.now()) / 1000));

  return {
    allowed: nextCount <= limit,
    limit,
    count: nextCount,
    retryAfter
  };
}

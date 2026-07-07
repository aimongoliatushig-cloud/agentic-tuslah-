import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { readIntEnv } from "@/server/env";

function hashLimiterKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function windowStartMs(windowSeconds: number) {
  return Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
}

type MemoryCounter = {
  windowStart: number;
  expiresAt: number;
  count: number;
};

// Per-process counters. The gateway runs as a single container, so this is both
// correct and much cheaper than a DB round-trip per request. Set
// API_GATEWAY_RATE_LIMIT_BACKEND=db when running multiple instances.
const memoryCounters = new Map<string, MemoryCounter>();

function pruneExpiredCounters(now: number) {
  for (const [key, entry] of memoryCounters) {
    if (entry.expiresAt <= now) {
      memoryCounters.delete(key);
    }
  }
}

function incrementMemoryCounter(key: string, windowSeconds: number) {
  const now = Date.now();
  const start = windowStartMs(windowSeconds);
  const entry = memoryCounters.get(key);

  if (entry && entry.windowStart === start) {
    entry.count += 1;
    return entry.count;
  }

  pruneExpiredCounters(now);
  memoryCounters.set(key, {
    windowStart: start,
    expiresAt: start + windowSeconds * 1000,
    count: 1
  });

  return 1;
}

async function incrementDbCounter(key: string, windowSeconds: number) {
  const start = new Date(windowStartMs(windowSeconds)).toISOString();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_window_start: start
  });

  if (error) {
    throw new Error(`Unable to increment rate limit: ${error.message}`);
  }

  return data?.[0]?.count ?? 0;
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
  const useDb = process.env.API_GATEWAY_RATE_LIMIT_BACKEND === "db";
  const nextCount = useDb
    ? await incrementDbCounter(key, windowSeconds)
    : incrementMemoryCounter(key, windowSeconds);
  const retryAfter = Math.max(
    1,
    Math.ceil((windowStartMs(windowSeconds) + windowSeconds * 1000 - Date.now()) / 1000)
  );

  return {
    allowed: nextCount <= limit,
    limit,
    count: nextCount,
    retryAfter
  };
}

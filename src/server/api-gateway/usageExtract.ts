/**
 * Extracts OpenAI-style token usage from a provider response or SSE chunk.
 * Handles both `prompt_tokens`/`completion_tokens` and `input_tokens`/`output_tokens`
 * naming, plus DeepSeek-style cache-hit fields and `prompt_tokens_details.cached_tokens`.
 */
export function extractTokenUsage(data: unknown) {
  const usage =
    data && typeof data === "object" && !Array.isArray(data) && "usage" in data
      ? (data as Record<string, unknown>).usage
      : undefined;

  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    return {};
  }

  const usageRecord = usage as Record<string, unknown>;
  const inputTokens =
    typeof usageRecord.prompt_tokens === "number"
      ? usageRecord.prompt_tokens
      : typeof usageRecord.input_tokens === "number"
        ? usageRecord.input_tokens
        : undefined;
  const outputTokens =
    typeof usageRecord.completion_tokens === "number"
      ? usageRecord.completion_tokens
      : typeof usageRecord.output_tokens === "number"
        ? usageRecord.output_tokens
        : undefined;
  const totalTokens =
    typeof usageRecord.total_tokens === "number"
      ? usageRecord.total_tokens
      : inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined;
  const details =
    usageRecord.prompt_tokens_details &&
    typeof usageRecord.prompt_tokens_details === "object" &&
    !Array.isArray(usageRecord.prompt_tokens_details)
      ? (usageRecord.prompt_tokens_details as Record<string, unknown>)
      : {};
  const inputCacheHitTokens =
    typeof usageRecord.prompt_cache_hit_tokens === "number"
      ? usageRecord.prompt_cache_hit_tokens
      : typeof details.cached_tokens === "number"
        ? details.cached_tokens
        : undefined;
  const inputCacheMissTokens =
    typeof usageRecord.prompt_cache_miss_tokens === "number"
      ? usageRecord.prompt_cache_miss_tokens
      : inputTokens !== undefined && inputCacheHitTokens !== undefined
        ? Math.max(0, inputTokens - inputCacheHitTokens)
        : undefined;

  return { inputTokens, outputTokens, totalTokens, inputCacheHitTokens, inputCacheMissTokens };
}

export type TokenUsage = ReturnType<typeof extractTokenUsage>;

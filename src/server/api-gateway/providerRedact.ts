import type { ProviderResult } from "@/server/api-gateway/types";
import { readIntEnv } from "@/server/env";

export function redactProviderData(data: ProviderResult["data"]): ProviderResult["data"] {
  const maxLength = readIntEnv("API_GATEWAY_PROVIDER_RESPONSE_MAX_CHARS", 20_000);
  const shouldStoreRaw = process.env.API_GATEWAY_STORE_RAW_PROVIDER_RESPONSE === "true";

  if (shouldStoreRaw) {
    return data;
  }

  const text = JSON.stringify(data, (key, value) => {
    const normalized = key.toLowerCase();

    if (isSensitiveProviderField(normalized)) {
      return "[redacted]";
    }

    return value;
  });

  if (text === undefined) {
    return null;
  }

  if (text.length <= maxLength) {
    return JSON.parse(text) as ProviderResult["data"];
  }

  return {
    truncated: true,
    originalLength: text.length,
    preview: text.slice(0, maxLength)
  };
}

function isSensitiveProviderField(normalizedKey: string) {
  return (
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("api_key") ||
    normalizedKey.includes("apikey") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("password") ||
    normalizedKey === "token" ||
    normalizedKey.endsWith("_token") && !normalizedKey.endsWith("_tokens") ||
    normalizedKey.endsWith("-token") && !normalizedKey.endsWith("-tokens")
  );
}

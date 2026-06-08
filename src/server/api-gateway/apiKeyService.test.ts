import { describe, expect, it } from "vitest";

import {
  createApiKeyPreview,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey
} from "@/server/api-gateway/apiKeyService";

describe("apiKeyService", () => {
  it("generates parseable key-id based keys", () => {
    const key = generateApiKey();
    const parsed = parseApiKey(key);

    expect(parsed?.keyId).toMatch(/^[a-f0-9]{16}$/);
    expect(parsed?.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(createApiKeyPreview(key)).toContain("...");
  });

  it("verifies hashes with timing-safe compatible hashes", () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);

    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey(`${key}x`, hash)).toBe(false);
  });

  it("rejects legacy or malformed keys in parser", () => {
    expect(parseApiKey("agf_live_legacysecret")).toBeNull();
    expect(parseApiKey("bad")).toBeNull();
  });
});

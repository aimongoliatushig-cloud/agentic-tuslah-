import { describe, expect, it } from "vitest";

import { validateGatewayGeneratePayload } from "@/server/api-gateway/validation";

describe("validateGatewayGeneratePayload", () => {
  it("accepts a minimal prompt payload", () => {
    const result = validateGatewayGeneratePayload({
      model: "deepseek-chat",
      prompt: "hello",
      parameters: { max_tokens: 100, temperature: 0.5 }
    });

    expect(result.ok).toBe(true);
  });

  it("rejects huge prompts and invalid max_tokens", () => {
    const result = validateGatewayGeneratePayload({
      model: "deepseek-chat",
      prompt: "x".repeat(20_001),
      parameters: { max_tokens: 100_000 }
    });

    expect(result.ok).toBe(false);
  });

  it("validates chat messages", () => {
    const result = validateGatewayGeneratePayload({
      model: "deepseek-chat",
      input: {
        messages: [{ role: "user", content: "hello" }]
      }
    });

    expect(result.ok).toBe(true);
  });
});

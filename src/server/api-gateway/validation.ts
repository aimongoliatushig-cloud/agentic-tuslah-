import { z } from "zod";

import type { GatewayGeneratePayload } from "@/server/api-gateway/types";

const jsonPrimitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitive> | { [key: string]: JsonValue } | JsonValue[];

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([jsonPrimitive, z.array(jsonValue).max(200), z.record(z.string(), jsonValue)])
);

const messageSchema = z.object({
  role: z.string().min(1).max(50),
  content: jsonValue
});

const inputSchema = z
  .record(z.string(), jsonValue)
  .superRefine((value, ctx) => {
    const messages = value.messages;

    if (messages === undefined) {
      return;
    }

    if (!Array.isArray(messages)) {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "input.messages must be an array."
      });
      return;
    }

    if (messages.length > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "input.messages cannot contain more than 100 messages."
      });
    }

    for (const [index, message] of messages.entries()) {
      const parsed = messageSchema.safeParse(message);

      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["messages", index],
          message: "Each message must include role and JSON-serializable content."
        });
      }
    }
  });

const parametersSchema = z
  .record(z.string(), jsonValue)
  .superRefine((value, ctx) => {
    const maxTokens = value.max_tokens ?? value.maxTokens;
    const temperature = value.temperature;

    if (maxTokens !== undefined) {
      if (typeof maxTokens !== "number" || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) {
        ctx.addIssue({
          code: "custom",
          path: ["max_tokens"],
          message: "max_tokens/maxTokens must be an integer between 1 and 4096."
        });
      }
    }

    if (temperature !== undefined) {
      if (typeof temperature !== "number" || temperature < 0 || temperature > 2) {
        ctx.addIssue({
          code: "custom",
          path: ["temperature"],
          message: "temperature must be between 0 and 2."
        });
      }
    }
  });

const gatewayGenerateSchema = z
  .object({
    model: z.string().min(1).max(100),
    prompt: z.string().max(20_000).optional(),
    input: inputSchema.optional(),
    parameters: parametersSchema.optional()
  })
  .strict()
  .refine((value) => value.prompt !== undefined || value.input !== undefined, {
    message: "Either prompt or input is required.",
    path: ["prompt"]
  });

export type ValidationResult =
  | { ok: true; payload: GatewayGeneratePayload }
  | {
      ok: false;
      details: Array<{
        path: string;
        message: string;
      }>;
    };

export function validateGatewayGeneratePayload(value: unknown): ValidationResult {
  const parsed = gatewayGenerateSchema.safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    };
  }

  return { ok: true, payload: parsed.data as GatewayGeneratePayload };
}

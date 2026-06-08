import crypto from "node:crypto";

import { jsonError, jsonOk } from "@/server/http";
import { processGatewayRequest } from "@/server/api-gateway/gatewayService";
import type { GatewayGeneratePayload } from "@/server/api-gateway/types";

export const runtime = "nodejs";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content:
    | string
    | Array<{
        type?: string;
        text?: string;
        content?: string;
      }>;
}

interface ChatCompletionsBody {
  model?: string;
  messages?: ChatMessage[];
  stream?: boolean;
  [key: string]: unknown;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function contentToText(content: ChatMessage["content"]) {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => part.text ?? part.content ?? "")
    .filter(Boolean)
    .join("\n");
}

function buildGatewayPayload(body: ChatCompletionsBody): GatewayGeneratePayload {
  const { model, messages, ...parameters } = body;
  delete parameters.stream;
  delete parameters.stream_options;

  return {
    model: model ?? "deepseek-chat",
    input: {
      messages: (messages ?? []).map((message) => ({
        role: message.role,
        content: contentToText(message.content)
      }))
    },
    parameters
  };
}

function toOpenAiCompatibleFallback(result: Awaited<ReturnType<typeof processGatewayRequest>>) {
  return {
    id: result.requestId,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: result.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            typeof result.provider === "object" && result.provider && "output" in result.provider
              ? String(result.provider.output)
              : JSON.stringify(result.provider)
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null
    }
  };
}

function toOpenAiCompatibleResponse(result: Awaited<ReturnType<typeof processGatewayRequest>>) {
  if (
    result.provider &&
    typeof result.provider === "object" &&
    !Array.isArray(result.provider) &&
    "choices" in result.provider
  ) {
    return result.provider;
  }

  return toOpenAiCompatibleFallback(result);
}

function createStreamResponse(completion: unknown) {
  const response =
    completion && typeof completion === "object" && !Array.isArray(completion)
      ? (completion as {
          id?: string;
          model?: string;
          choices?: Array<{
            message?: {
              content?: unknown;
            };
          }>;
        })
      : null;
  const id = response?.id ?? `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const model = response?.model ?? "gateway";
  const content = response?.choices?.[0]?.message?.content;
  const encoded = new TextEncoder().encode(
    [
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: typeof content === "string" ? content : JSON.stringify(content ?? "")
            },
            finish_reason: null
          }
        ]
      })}`,
      "",
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop"
          }
        ]
      })}`,
      "",
      "data: [DONE]",
      ""
    ].join("\n")
  );

  return new Response(encoded, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

export async function POST(request: Request) {
  try {
    const apiKey = readBearerToken(request);

    if (!apiKey) {
      return jsonError("Missing Authorization: Bearer CLIENT_API_KEY header.", 401);
    }

    const body = (await request.json()) as ChatCompletionsBody;

    if (!body.model) {
      return jsonError("Request body must include model.", 400);
    }

    if (!body.messages || body.messages.length === 0) {
      return jsonError("Request body must include messages.", 400);
    }

    const result = await processGatewayRequest({
      apiKey,
      payload: buildGatewayPayload(body)
    });
    const completion = toOpenAiCompatibleResponse(result);

    if (body.stream) {
      return createStreamResponse(completion);
    }

    return jsonOk(completion);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gateway chat completion failed.";
    const status =
      message.includes("Invalid or inactive")
        ? 401
        : message.includes("Insufficient") ||
            message.includes("Budget") ||
            message.includes("хэрэглээ дууссан")
          ? 402
          : message.includes("unavailable")
            ? 404
            : 400;

    return jsonError(message, status);
  }
}

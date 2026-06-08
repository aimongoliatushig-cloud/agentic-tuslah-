import "./load-env";

import { getSupabaseAdminClient } from "../src/lib/supabaseAdmin";
import { hashApiKey } from "../src/server/api-gateway/apiKeyService";

interface HealthResponse {
  status: string;
  database_connected: boolean;
  mock_provider_mode: boolean;
  timestamp: string;
}

interface GenerateResponse {
  ok?: boolean;
  data?: {
    requestId: string;
    model: string;
    creditCost: number;
    balanceAfter: number;
    provider: unknown;
  };
  error?: string;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

async function readJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as T;

  return {
    response,
    data
  };
}

async function findDemoClient(apiKey: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_clients")
    .select("*")
    .eq("api_key_hash", hashApiKey(apiKey))
    .single();

  if (error) {
    throw new Error(`Unable to find demo client by API key hash: ${error.message}`);
  }

  return data;
}

async function findUsageLog(requestId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_usage_logs")
    .select("*")
    .eq("request_id", requestId)
    .single();

  if (error) {
    throw new Error(`Unable to find usage log for request ${requestId}: ${error.message}`);
  }

  return data;
}

async function main() {
  const baseUrl = process.env.API_GATEWAY_TEST_BASE_URL ?? "http://localhost:3000";
  const demoApiKey = requiredEnv("API_GATEWAY_DEMO_API_KEY");
  const testModel = process.env.API_GATEWAY_TEST_MODEL ?? "image-basic";
  const clientBefore = await findDemoClient(demoApiKey);

  const { response: healthHttp, data: health } = await readJson<HealthResponse>(
    `${baseUrl}/api/gateway/health`
  );

  if (!healthHttp.ok || !health.database_connected) {
    throw new Error(
      `Gateway health check failed: ${JSON.stringify({
        status: healthHttp.status,
        body: health
      })}`
    );
  }

  const { response: generateHttp, data: generate } = await readJson<GenerateResponse>(
    `${baseUrl}/api/gateway/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${demoApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: testModel,
        prompt: "Smoke test request from scripts/test-api-gateway.ts",
        parameters: {
          max_tokens: 64
        }
      })
    }
  );

  if (!generateHttp.ok || !generate.ok || !generate.data) {
    throw new Error(
      `Gateway generate failed: ${JSON.stringify({
        status: generateHttp.status,
        body: generate
      })}`
    );
  }

  const clientAfter = await findDemoClient(demoApiKey);
  const expectedBalance = clientBefore.credit_balance - generate.data.creditCost;

  if (clientAfter.credit_balance !== expectedBalance) {
    throw new Error(
      `Credit deduction mismatch. Expected ${expectedBalance}, got ${clientAfter.credit_balance}.`
    );
  }

  const usageLog = await findUsageLog(generate.data.requestId);

  if (usageLog.status !== "success") {
    throw new Error(`Usage log status mismatch. Expected success, got ${usageLog.status}.`);
  }

  const supabase = getSupabaseAdminClient();
  const expensiveModelName = `smoke-expensive-${Date.now()}`;
  const expensiveModelCost = clientAfter.credit_balance + 1000;
  const { data: expensiveModel, error: expensiveModelError } = await supabase
    .from("api_models")
    .insert({
      name: expensiveModelName,
      provider: "mock",
      provider_model: expensiveModelName,
      credit_cost: expensiveModelCost,
      status: "active",
      config: { smokeTest: true }
    })
    .select()
    .single();

  if (expensiveModelError) {
    throw new Error(`Unable to create expensive smoke test model: ${expensiveModelError.message}`);
  }

  const { response: failedHttp, data: failedGenerate } = await readJson<GenerateResponse>(
    `${baseUrl}/api/gateway/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${demoApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: expensiveModelName,
        prompt: "This request should fail because the model costs more than the client balance."
      })
    }
  );

  if (failedHttp.status !== 402 || !failedGenerate.error) {
    throw new Error(`Expected insufficient-credit failure, got HTTP ${failedHttp.status}.`);
  }

  const { data: failedUsageLog, error: failedUsageLogError } = await supabase
    .from("api_usage_logs")
    .select("*")
    .eq("client_id", clientAfter.id)
    .eq("model_id", expensiveModel.id)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (failedUsageLogError) {
    throw new Error(`Unable to find failed usage log: ${failedUsageLogError.message}`);
  }

  console.log("API Gateway smoke test passed.");
  console.log(`Health status: ${health.status}`);
  console.log(`Database connected: ${health.database_connected}`);
  console.log(`Mock provider mode: ${health.mock_provider_mode}`);
  console.log(`Request id: ${generate.data.requestId}`);
  console.log(`Credit cost: ${generate.data.creditCost}`);
  console.log(`Balance before: ${clientBefore.credit_balance}`);
  console.log(`Balance after: ${clientAfter.credit_balance}`);
  console.log(`Usage log id: ${usageLog.id}`);
  console.log(`Failed request check: HTTP ${failedHttp.status} ${failedGenerate.error}`);
  console.log(`Failed usage log id: ${failedUsageLog.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

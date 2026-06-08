import "./load-env";

import {
  createApiKeyPreview,
  generateApiKey,
  hashApiKey
} from "../src/server/api-gateway/apiKeyService";
import { addCredit } from "../src/server/api-gateway/creditService";
import { getSupabaseAdminClient } from "../src/lib/supabaseAdmin";

async function main() {
  const supabase = getSupabaseAdminClient();
  const apiKey = generateApiKey();
  const demoClientName = "Demo API Gateway Client";
  const demoModelName = "image-basic";
  const startingCreditBalance = 100;
  let demoModelId: string;

  const { data: existingModel, error: modelReadError } = await supabase
    .from("api_models")
    .select("*")
    .eq("name", demoModelName)
    .maybeSingle();

  if (modelReadError) {
    throw new Error(
      `Unable to read demo model: ${modelReadError.message}. Run the API Gateway migration before seeding.`
    );
  }

  if (!existingModel) {
    const { data: createdModel, error } = await supabase
      .from("api_models")
      .insert({
        name: demoModelName,
        provider: "mock",
        provider_model: demoModelName,
        credit_cost: 1,
        billing_type: "image",
        input_1k_token_price_mnt: 0,
        output_1k_token_price_mnt: 0,
        unit_price_mnt: 100,
        unit_price_usd: 0.03,
        pricing_source_url: "demo",
        pricing_checked_at: new Date().toISOString(),
        status: "active",
        config: { demo: true }
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Unable to seed demo model: ${error.message}`);
    }

    demoModelId = createdModel.id;
  } else {
    demoModelId = existingModel.id;
  }

  const { data: existingClient, error: clientReadError } = await supabase
    .from("api_clients")
    .select("*")
    .eq("name", demoClientName)
    .maybeSingle();

  if (clientReadError) {
    throw new Error(`Unable to read demo client: ${clientReadError.message}`);
  }

  if (existingClient) {
    console.log("Demo client already exists.");
    console.log(`Demo client name: ${existingClient.name}`);
    console.log(`Client id: ${existingClient.id}`);
    console.log(`API key preview: ${existingClient.api_key_preview}`);
    console.log("Raw API key: not available. It is printed only once when the client is first created.");
    console.log(`Current credit balance: ${existingClient.credit_balance}`);
    console.log(`Demo model name: ${demoModelName}`);
    console.log(`Demo model id: ${demoModelId}`);
    return;
  }

  const { data: client, error: clientCreateError } = await supabase
    .from("api_clients")
    .insert({
      name: demoClientName,
      api_key_hash: hashApiKey(apiKey),
      api_key_preview: createApiKeyPreview(apiKey),
      credit_balance: 0,
      metadata: { demo: true }
    })
    .select()
    .single();

  if (clientCreateError) {
    throw new Error(`Unable to seed demo client: ${clientCreateError.message}`);
  }

  const transaction = await addCredit(client.id, startingCreditBalance, "Demo seed credit");
  const baseUrl = process.env.API_GATEWAY_TEST_BASE_URL ?? "http://localhost:3000";

  console.log("Demo API Gateway seed created.");
  console.log(`Demo client name: ${client.name}`);
  console.log(`Client id: ${client.id}`);
  console.log(`Demo API key: ${apiKey}`);
  console.log(`Starting credit balance: ${transaction.balance_after}`);
  console.log(`Demo model name: ${demoModelName}`);
  console.log(`Demo model id: ${demoModelId}`);
  console.log("Store this key somewhere safe. It is not stored in the database.");
  console.log("");
  console.log("Curl test:");
  console.log(`curl -X POST ${baseUrl}/api/gateway/generate \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -H "Authorization: Bearer ${apiKey}" \\`);
  console.log(`  -d '{"model":"${demoModelName}","prompt":"Create a clean product image concept"}'`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

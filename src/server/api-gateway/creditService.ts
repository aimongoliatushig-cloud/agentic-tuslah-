import crypto from "node:crypto";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export async function getBalance(clientId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("api_clients")
    .select("credit_balance")
    .eq("id", clientId)
    .single();

  if (error) {
    throw new Error(`Unable to read credit balance: ${error.message}`);
  }

  return data.credit_balance;
}

export async function addCredit(clientId: string, amount: number, note?: string) {
  if (amount <= 0) {
    throw new Error("Credit amount must be greater than zero.");
  }

  const supabase = getSupabaseAdminClient();
  const currentBalance = await getBalance(clientId);
  const balanceAfter = currentBalance + amount;

  const { error: updateError } = await supabase
    .from("api_clients")
    .update({ credit_balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq("id", clientId);

  if (updateError) {
    throw new Error(`Unable to add credit: ${updateError.message}`);
  }

  const { data, error } = await supabase
    .from("api_credit_transactions")
    .insert({
      client_id: clientId,
      amount,
      type: "credit",
      balance_after: balanceAfter,
      note: note ?? null
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Unable to create credit transaction: ${error.message}`);
  }

  return data;
}

export async function deductCredit(clientId: string, amount: number, note?: string, requestId?: string) {
  if (amount <= 0) {
    throw new Error("Debit amount must be greater than zero.");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("deduct_credit_if_sufficient", {
    p_client_id: clientId,
    p_amount: amount,
    p_request_id: requestId ?? crypto.randomUUID(),
    p_note: note ?? null,
    p_metadata: {}
  });

  if (error) {
    throw new Error(`Unable to deduct credit: ${error.message}`);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error("Insufficient credit balance.");
  }

  return {
    id: row.transaction_id,
    client_id: clientId,
    amount,
    type: "debit" as const,
    balance_after: row.balance_after,
    note: note ?? null,
    metadata: { request_id: requestId ?? null },
    created_at: new Date().toISOString()
  };
}

export async function checkSufficientCredit(clientId: string, requiredCredit: number) {
  const balance = await getBalance(clientId);
  return {
    sufficient: balance >= requiredCredit,
    balance,
    requiredCredit
  };
}

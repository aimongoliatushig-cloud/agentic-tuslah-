import { addCredit } from "@/server/api-gateway/creditService";
import { writeAdminAuditLog } from "@/server/adminAudit";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

interface AddCreditBody {
  amount?: number;
  amountMnt?: number;
  note?: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authError = requireAdminAccess(request);
    if (authError) return authError;

    const { id } = await context.params;
    const body = await readJson<AddCreditBody>(request);

    const amount = Math.round(Number(body.amountMnt ?? body.amount ?? 0));

    if (!amount || amount <= 0) {
      return jsonError("Top-up amount is required.", 400);
    }

    const transaction = await addCredit(id, amount, body.note ?? "Admin MNT top-up");
    await writeAdminAuditLog({
      request,
      action: "api_client.add_credit",
      entityType: "api_client",
      entityId: id,
      after: transaction
    });

    return jsonOk({ transaction });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to add credit.", 500);
  }
}

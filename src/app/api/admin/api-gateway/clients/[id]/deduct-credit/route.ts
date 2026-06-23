import { deductCredit } from "@/server/api-gateway/creditService";
import { writeAdminAuditLog } from "@/server/adminAudit";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

interface DeductCreditBody {
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
    const body = await readJson<DeductCreditBody>(request);

    const amount = Math.round(Number(body.amountMnt ?? body.amount ?? 0));

    if (!amount || amount <= 0) {
      return jsonError("Хасах дүн шаардлагатай.", 400);
    }

    const transaction = await deductCredit(id, amount, body.note ?? "Admin MNT хасалт");
    await writeAdminAuditLog({
      request,
      action: "api_client.deduct_credit",
      entityType: "api_client",
      entityId: id,
      after: transaction
    });

    return jsonOk({ transaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Кредит хасахад алдаа гарлаа.";
    const status = message.includes("Insufficient") ? 400 : 500;
    return jsonError(message.includes("Insufficient") ? "Үлдэгдэл хүрэлцэхгүй байна." : message, status);
  }
}

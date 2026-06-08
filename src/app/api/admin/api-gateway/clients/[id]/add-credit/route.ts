import { addCredit } from "@/server/api-gateway/creditService";
import { jsonError, jsonOk, readJson, requireAdminAccess } from "@/server/http";

export const runtime = "nodejs";

interface AddCreditBody {
  amount?: number;
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

    if (!body.amount) {
      return jsonError("Credit amount is required.", 400);
    }

    const transaction = await addCredit(id, body.amount, body.note ?? "Admin credit top-up");
    return jsonOk({ transaction });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to add credit.", 500);
  }
}

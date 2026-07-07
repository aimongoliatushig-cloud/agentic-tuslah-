/**
 * Tracks the estimated USD cost of requests that passed the budget check but
 * have not been logged yet. Budget limits are enforced as
 * `spent + inflight + estimate <= limit`, which closes the window where several
 * concurrent requests could each pass the check before any of them shows up in
 * api_usage_logs.
 *
 * State is per-process, which matches the single-container deployment. When the
 * gateway scales horizontally this becomes best-effort per instance; the hard
 * atomic limit remains the credit balance.
 */
const inflightByClient = new Map<string, number>();

export function getInflightBudgetUsd(clientId: string) {
  return inflightByClient.get(clientId) ?? 0;
}

/**
 * Reserves an estimate and returns an idempotent release function. Callers must
 * release once the request's cost is recorded (or the request fails).
 */
export function reserveInflightBudget(clientId: string, estimatedCostUsd: number) {
  const amount = Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0 ? estimatedCostUsd : 0;
  inflightByClient.set(clientId, getInflightBudgetUsd(clientId) + amount);

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    const next = getInflightBudgetUsd(clientId) - amount;

    if (next <= 1e-9) {
      inflightByClient.delete(clientId);
    } else {
      inflightByClient.set(clientId, next);
    }
  };
}

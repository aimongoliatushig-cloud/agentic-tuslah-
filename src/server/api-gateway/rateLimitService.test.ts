import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn()
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  getSupabaseAdminClient: () => ({
    rpc: mocks.rpc
  })
}));

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("increments through the atomic RPC and preserves retry metadata when backend is db", async () => {
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_BACKEND", "db");
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_REQUESTS", "2");
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_WINDOW_SECONDS", "60");
    const { checkRateLimit } = await import("@/server/api-gateway/rateLimitService");
    let count = 0;

    mocks.rpc.mockImplementation(async (name: string) => {
      expect(name).toBe("increment_rate_limit");
      count += 1;
      return {
        data: [{ count }],
        error: null
      };
    });

    const first = await checkRateLimit({
      apiKey: "agf_live_test",
      route: "generate"
    });
    const second = await checkRateLimit({
      apiKey: "agf_live_test",
      route: "generate"
    });
    const third = await checkRateLimit({
      apiKey: "agf_live_test",
      route: "generate"
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.limit).toBe(2);
    expect(third.count).toBe(3);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });

  it("counts in memory without touching the database by default", async () => {
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_REQUESTS", "2");
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_WINDOW_SECONDS", "60");
    const { checkRateLimit } = await import("@/server/api-gateway/rateLimitService");

    const first = await checkRateLimit({
      apiKey: "agf_live_memory_test",
      route: "memory-route"
    });
    const second = await checkRateLimit({
      apiKey: "agf_live_memory_test",
      route: "memory-route"
    });
    const third = await checkRateLimit({
      apiKey: "agf_live_memory_test",
      route: "memory-route"
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.count).toBe(3);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("isolates counters per route and per key", async () => {
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_REQUESTS", "1");
    vi.stubEnv("API_GATEWAY_RATE_LIMIT_WINDOW_SECONDS", "60");
    const { checkRateLimit } = await import("@/server/api-gateway/rateLimitService");

    const sameKeyOtherRoute = await checkRateLimit({
      apiKey: "agf_live_isolation_test",
      route: "route-a"
    });
    const otherKeySameRoute = await checkRateLimit({
      apiKey: "agf_live_isolation_other",
      route: "route-a"
    });
    const blocked = await checkRateLimit({
      apiKey: "agf_live_isolation_test",
      route: "route-a"
    });

    expect(sameKeyOtherRoute.allowed).toBe(true);
    expect(otherKeySameRoute.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
  });
});

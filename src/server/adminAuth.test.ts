import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAdminSessionCookieValue,
  verifyAdminRequest,
  verifyAdminSessionCookie,
  verifyAdminToken
} from "@/server/adminAuth";

describe("adminAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed in production when token is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_GATEWAY_ADMIN_TOKEN", "");
    vi.stubEnv("API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV", "false");

    const result = verifyAdminRequest(new Request("https://example.com/api/admin/api-gateway/clients"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.code).toBe("admin_auth_not_configured");
    }
  });

  it("denies wrong token and allows correct token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_GATEWAY_ADMIN_TOKEN", "secret-admin-token");

    const denied = verifyAdminRequest(
      new Request("https://example.com/api/admin/api-gateway/clients", {
        headers: { Authorization: "Bearer wrong" }
      })
    );
    const allowed = verifyAdminRequest(
      new Request("https://example.com/api/admin/api-gateway/clients", {
        headers: { Authorization: "Bearer secret-admin-token" }
      })
    );

    expect(denied.ok).toBe(false);
    expect(allowed.ok).toBe(true);
    expect(verifyAdminToken("secret-admin-token")).toBe(true);
    expect(verifyAdminToken("wrong")).toBe(false);
    expect(verifyAdminToken("")).toBe(false);
  });

  it("allows explicitly unsafe local dev mode only when enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("API_GATEWAY_ADMIN_TOKEN", "");
    vi.stubEnv("API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV", "true");

    const result = verifyAdminRequest(new Request("https://example.com/api/admin/api-gateway/clients"));

    expect(result.ok).toBe(true);
  });

  it("verifies signed admin session cookies", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("API_GATEWAY_ADMIN_TOKEN", "secret-admin-token");
    const cookie = createAdminSessionCookieValue("secret-admin-token");

    expect(verifyAdminSessionCookie(cookie).ok).toBe(true);
    expect(verifyAdminSessionCookie(`${cookie}x`).ok).toBe(false);
  });
});

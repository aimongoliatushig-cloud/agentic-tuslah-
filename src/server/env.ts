export function readIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function optionalEnv(name: string) {
  const value = process.env[name];
  return value && value.trim() ? value : undefined;
}

export function requireEnv(name: string) {
  const value = optionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function isTest() {
  return process.env.NODE_ENV === "test";
}

export function isUnsafeAdminDevAllowed() {
  return !isProduction() && process.env.API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV === "true";
}

export function readJsonEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
